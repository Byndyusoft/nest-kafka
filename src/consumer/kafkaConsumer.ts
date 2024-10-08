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

import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
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
} from "../consts";
import { IKafkaOptions } from "../options";

import { IKafkaConsumerSerializedOptions } from "./interfaces";
import { KafkaConsumerMessageHandler } from "./kafkaConsumerMessageHandler";

@Injectable()
export class KafkaConsumer
  extends Server
  implements CustomTransportStrategy, OnApplicationBootstrap
{
  public readonly transportId = KafkaConsumerTransportId;

  private applicationBootstrapped = false;

  private readonly messageHandlersMap: Map<
    string,
    Map<string, MessageHandler>
  > = new Map();

  public constructor(
    @Inject(ConsumersMapToken)
    private readonly consumersMap: Map<string, Consumer>,
    private readonly kafkaConsumerMessageHandler: KafkaConsumerMessageHandler,
    @Inject(KafkaOptionsToken)
    private readonly kafkaOptions: IKafkaOptions,
  ) {
    super();
  }

  public async close(): Promise<void> {
    await Promise.all(
      [...this.consumersMap.values()].map((x) => x.disconnect()),
    );
  }

  public listen(callback: (error?: unknown) => void): void {
    if (!this.applicationBootstrapped) {
      const errorMessage =
        "Application is not bootstrapped. " +
        "Ensure that you have called app.listen() " +
        "before calling app.startAllMicroservices(). " +
        "The listen method was invoked before the application finished bootstrapping.";

      this.logger.error(errorMessage);
      return callback(new Error(errorMessage));
    }

    this.start().then(callback).catch(callback);
  }

  public onApplicationBootstrap(): void {
    this.applicationBootstrapped = true;
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

  private getConsumer(connectionName: string): Consumer {
    const consumer = this.consumersMap.get(connectionName);

    if (!consumer) {
      throw new Error(
        `Consumer for connection name "${connectionName}" doesn't exists!`,
      );
    }

    return consumer;
  }

  private async run(): Promise<void> {
    for (const [connectionName, consumer] of this.consumersMap) {
      await consumer.run({
        eachMessage: async (rawPayload) => {
          const messageHandler = this.messageHandlersMap
            .get(connectionName)!
            .get(rawPayload.topic)!;

          await this.kafkaConsumerMessageHandler.handleMessage(
            connectionName,
            messageHandler,
            rawPayload,
          );
        },
      });
    }
  }

  private async start(): Promise<void> {
    await Promise.all([...this.consumersMap.values()].map((x) => x.connect()));

    await this.subscribe();
    await this.run();
  }

  private async subscribe(): Promise<void> {
    const context = vm.createContext({
      topicPickerArgs: this.kafkaOptions.topicPickerArgs,
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

      await this.getConsumer(connectionName).subscribe({
        topics,
        fromBeginning,
      });

      this.addMessageHandlerToMap(connectionName, topics, messageHandler);
    }
  }
}
