/*
 * Copyright 2022 Byndyusoft
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

/* eslint-disable no-await-in-loop */

import vm from "vm";

import { Inject, Injectable } from "@nestjs/common";
import {
  CustomTransportStrategy,
  MessageHandler,
  Server,
} from "@nestjs/microservices";
import { Consumer } from "kafkajs";

import {
  ConsumersMapToken,
  KafkaConsumerTransportId,
  KafkaOptionsToken,
} from "~/src/consts";
import { IKafkaOptions } from "~/src/options";

import { IKafkaConsumerSerializedOptions } from "./interfaces";
import { KafkaConsumerMessageHandler } from "./kafkaConsumerMessageHandler";

@Injectable()
export class KafkaConsumer extends Server implements CustomTransportStrategy {
  public readonly transportId = KafkaConsumerTransportId;

  private readonly __messageHandlersMap: Map<
    string,
    Map<string, MessageHandler>
  > = new Map();

  public constructor(
    @Inject(ConsumersMapToken)
    private readonly __consumersMap: Map<string, Consumer>,
    private readonly __kafkaConsumerMessageHandler: KafkaConsumerMessageHandler,
    @Inject(KafkaOptionsToken)
    private readonly __kafkaOptions: IKafkaOptions,
  ) {
    super();
  }

  public async close(): Promise<void> {
    await Promise.all(
      [...this.__consumersMap.values()].map((x) => x.disconnect()),
    );
  }

  public listen(callback: (error?: unknown) => void): void {
    this.__start().then(callback).catch(callback);
  }

  private __addMessageHandlerToMap(
    connectionName: string,
    topics: string[],
    messageHandler: MessageHandler,
  ): void {
    if (!this.__messageHandlersMap.has(connectionName)) {
      this.__messageHandlersMap.set(connectionName, new Map());
    }

    const connectionsMap = this.__messageHandlersMap.get(connectionName)!;

    for (const topic of topics) {
      connectionsMap.set(topic, messageHandler);
    }
  }

  private __getConsumer(connectionName: string): Consumer {
    const consumer = this.__consumersMap.get(connectionName);

    if (!consumer) {
      throw new Error(
        `Consumer for connection name "${connectionName}" doesn't exists!`,
      );
    }

    return consumer;
  }

  private async __run(): Promise<void> {
    for (const [connectionName, consumer] of this.__consumersMap) {
      await consumer.run({
        eachMessage: async (rawPayload) => {
          const messageHandler = this.__messageHandlersMap
            .get(connectionName)!
            .get(rawPayload.topic)!;

          await this.__kafkaConsumerMessageHandler.handleMessage(
            connectionName,
            messageHandler,
            rawPayload,
          );
        },
      });
    }
  }

  private async __start(): Promise<void> {
    await Promise.all(
      [...this.__consumersMap.values()].map((x) => x.connect()),
    );

    await this.__subscribe();
    await this.__run();
  }

  private async __subscribe(): Promise<void> {
    const context = vm.createContext({
      topicPickerArgs: this.__kafkaOptions.topicPickerArgs,
    });

    for (const [
      messagePattern,
      messageHandler,
    ] of this.getHandlers().entries()) {
      const { connectionName, topicPicker, fromBeginning } = JSON.parse(
        messagePattern,
      ) as IKafkaConsumerSerializedOptions;

      const topics = [
        vm.runInContext(`(${topicPicker})(...topicPickerArgs)`, context) as
          | string
          | string[],
      ].flat();

      await this.__getConsumer(connectionName).subscribe({
        topics,
        fromBeginning,
      });

      this.__addMessageHandlerToMap(connectionName, topics, messageHandler);
    }
  }
}
