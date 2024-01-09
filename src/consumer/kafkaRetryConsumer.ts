/*
 * Copyright 2023 Byndyusoft
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import vm from "vm";

import { Inject, Injectable } from "@nestjs/common";
import {
  CustomTransportStrategy,
  MessageHandler,
  Server,
} from "@nestjs/microservices";
import { Kafka } from "kafkajs";

import {
  DefaultConnectionName,
  KafkaOptionsToken,
  KafkaRetryConsumerTransportId,
} from "../consts";
import { IKafkaConnection, IKafkaOptions } from "../options";

import { IKafkaConsumerOptions } from "./interfaces";
import { KafkaConsumerMessageHandler } from "./kafkaConsumerMessageHandler";

export interface IKafkaRetryConsumerRunOnceOptions {
  readonly connectionName?: string;
  readonly topic: string;
  readonly messagesCount: number;
}

@Injectable()
export class KafkaRetryConsumer
  extends Server
  implements CustomTransportStrategy
{
  public readonly transportId = KafkaRetryConsumerTransportId;

  private readonly connectionOptionsMap: Map<string, IKafkaConnection>;

  private readonly messageHandlersMap: Map<
    string,
    Map<string, MessageHandler>
  > = new Map();

  public constructor(
    private readonly kafkaConsumerMessageHandler: KafkaConsumerMessageHandler,
    @Inject(KafkaOptionsToken)
    private readonly kafkaOptions: IKafkaOptions,
  ) {
    super();

    this.connectionOptionsMap = new Map(
      kafkaOptions.connections
        .filter((x) => x.retryConsumer)
        .map((x) => [x.name ?? DefaultConnectionName, x]),
    );
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public listen(callback: (error?: unknown) => void): void {
    try {
      this.init();
      return callback();
    } catch (error) {
      return callback(error);
    }
  }

  public async runOnce({
    connectionName = DefaultConnectionName,
    topic,
    messagesCount: initialMessagesCount,
  }: IKafkaRetryConsumerRunOnceOptions): Promise<void> {
    if (initialMessagesCount <= 0) {
      throw new Error("messagesCount must be greater than zero!");
    }

    const connectionOptions = this.getConnectionOptions(connectionName);

    const {
      messageHandler,
      extras: { fromBeginning },
    } = this.getMessageHandlerAndExtras(connectionName, topic);

    const messagesCount = await this.calculateMessagesCount(
      topic,
      initialMessagesCount,
      connectionOptions,
    );

    if (messagesCount === 0) {
      return;
    }

    const retryConsumer = new Kafka(connectionOptions.cluster).consumer(
      connectionOptions.retryConsumer!,
    );

    await retryConsumer.connect();

    let processedMessagesCount = 0;

    try {
      await retryConsumer.subscribe({
        topic,
        fromBeginning,
      });

      await new Promise<void>((resolve, reject) => {
        retryConsumer
          .run({
            autoCommit: false,
            eachMessage: async (rawPayload) => {
              try {
                await this.kafkaConsumerMessageHandler.handleMessage(
                  connectionName,
                  messageHandler,
                  rawPayload,
                );

                await retryConsumer.commitOffsets([
                  {
                    topic,
                    partition: rawPayload.partition,
                    offset: (BigInt(rawPayload.message.offset) + 1n).toString(),
                  },
                ]);

                processedMessagesCount++;

                if (processedMessagesCount === messagesCount) {
                  retryConsumer.pause([{ topic }]);
                  resolve();
                }
              } catch (error) {
                retryConsumer.pause([{ topic }]);
                reject(error);
              }
            },
          })
          .catch(reject);
      });
    } finally {
      await retryConsumer.disconnect();
    }
  }

  private addMessageHandlerToMap(
    connectionName: string,
    topics: string[],
    messageHandler: MessageHandler,
  ): void {
    if (!this.messageHandlersMap.has(connectionName)) {
      this.messageHandlersMap.set(connectionName, new Map());
    }

    const connectionsMap = this.messageHandlersMap.get(connectionName)!;

    for (const topic of topics) {
      connectionsMap.set(topic, messageHandler);
    }
  }

  private async calculateMessagesCount(
    topic: string,
    initialMessagesCount: number,
    connectionOptions: IKafkaConnection,
  ): Promise<number> {
    let overallLag = 0n;

    const admin = new Kafka(connectionOptions.cluster).admin();

    await admin.connect();

    try {
      const [topicOffsets, [retryConsumerOffsets]] = await Promise.all([
        admin.fetchTopicOffsets(topic),
        admin.fetchOffsets({
          groupId: connectionOptions.retryConsumer!.groupId,
          topics: [topic],
        }),
      ]);

      for (const topicPartitionOffset of topicOffsets) {
        const retryConsumerPartitionOffset = BigInt(
          retryConsumerOffsets.partitions.find(
            (x) => x.partition === topicPartitionOffset.partition,
          )?.offset ?? 0n,
        );

        overallLag +=
          BigInt(topicPartitionOffset.high) -
          (retryConsumerPartitionOffset < 0n
            ? 0n
            : retryConsumerPartitionOffset);
      }
    } finally {
      await admin.disconnect();
    }

    return Math.min(initialMessagesCount, Number(overallLag));
  }

  private getConnectionOptions(connectionName: string): IKafkaConnection {
    const connectionOptions = this.connectionOptionsMap.get(connectionName);

    if (!connectionOptions) {
      throw new Error(
        `Connection options with name ${connectionName} doesn't exists!`,
      );
    }

    return connectionOptions;
  }

  private getMessageHandlerAndExtras(
    connectionName: string,
    topic: string,
  ): {
    readonly messageHandler: MessageHandler;
    readonly extras: IKafkaConsumerOptions;
  } {
    const messageHandler = this.messageHandlersMap
      .get(connectionName)
      ?.get(topic);

    if (!messageHandler) {
      throw new Error(
        `messageHandler for connection name ${connectionName} and topic ${topic} doesn't exists!`,
      );
    }

    return {
      messageHandler,
      extras: messageHandler.extras as IKafkaConsumerOptions,
    };
  }

  private init(): void {
    const vmContext = vm.createContext({
      topicPickerArgs: this.kafkaOptions.topicPickerArgs,
    });

    for (const [, messageHandler] of this.getHandlers().entries()) {
      const { connectionName = DefaultConnectionName, topicPicker } =
        messageHandler.extras as IKafkaConsumerOptions;

      const topics = [
        vm.runInContext(
          `(${topicPicker.toString()})(...topicPickerArgs)`,
          vmContext,
        ) as string | string[],
      ].flat();

      this.addMessageHandlerToMap(connectionName, topics, messageHandler);
    }
  }
}
