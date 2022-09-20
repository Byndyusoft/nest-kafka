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

import { TracingService } from "@byndyusoft/nest-opentracing";
import { AsyncContext as TracingAsyncContext } from "@byndyusoft/nest-opentracing/dist/async-context";
import { Inject, Injectable } from "@nestjs/common";
import { MessageHandler } from "@nestjs/microservices";
import { EachMessagePayload } from "kafkajs";
import { PinoLogger } from "nestjs-pino";
import { storage as loggerStorage, Store } from "nestjs-pino/storage";
import retry from "retry";
import { isObservable, lastValueFrom } from "rxjs";

import { KafkaOptionsToken } from "~/src/consts";
import { IKafkaOptions } from "~/src/options";
import { KafkaCoreProducer } from "~/src/producer";
import { KafkaCoreSchemaRegistry } from "~/src/schemaRegistry";

import { getErrorCause, KafkaConsumerError } from "./errors";
import { IKafkaConsumerContext, IKafkaConsumerPayload } from "./interfaces";
import { KafkaConsumerMessageHandlerLogger } from "./kafkaConsumerMessageHandlerLogger";

interface IProcessMessageOptions {
  readonly connectionName: string;
  readonly messageHandler: MessageHandler;
  readonly rawPayload: EachMessagePayload;
  readonly currentAttempt: number;
  readonly isFinalAttempt: boolean;
}

@Injectable()
export class KafkaConsumerMessageHandler {
  private readonly __totalAttempts: number;

  public constructor(
    private readonly __kafkaConsumerMessageHandlerLogger: KafkaConsumerMessageHandlerLogger,
    private readonly __kafkaCoreProducer: KafkaCoreProducer,
    private readonly __kafkaCoreSchemaRegistry: KafkaCoreSchemaRegistry,
    @Inject(KafkaOptionsToken)
    private readonly __kafkaOptions: IKafkaOptions,
    private readonly __logger: PinoLogger,
    private readonly __tracingAsyncContext: TracingAsyncContext,
    private readonly __tracingService: TracingService,
  ) {
    this.__logger.setContext(KafkaConsumerMessageHandler.name);

    this.__totalAttempts =
      (this.__kafkaOptions.consumerRetryOptions?.retries ?? 10) + 1;
  }

  public handleMessage(
    connectionName: string,
    messageHandler: MessageHandler,
    rawPayload: EachMessagePayload,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const operation = retry.operation(
        this.__kafkaOptions.consumerRetryOptions,
      );

      operation.attempt((currentAttempt) => {
        this.__processMessage({
          connectionName,
          messageHandler,
          rawPayload,
          currentAttempt,
          isFinalAttempt: currentAttempt === this.__totalAttempts,
        })
          .then(resolve)
          .catch((error) => {
            if (error instanceof KafkaConsumerError && error.retriable) {
              if (!operation.retry(error.cause as Error)) {
                reject(operation.mainError());
              }

              return;
            }

            operation.stop();
            reject(getErrorCause(error));
          });
      });
    });
  }

  private __prepareAsyncContext(
    {
      connectionName,
      rawPayload,
      currentAttempt,
      isFinalAttempt,
    }: IProcessMessageOptions,
    callback: () => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.__tracingAsyncContext.run(() => {
        const rootSpan = this.__tracingService.initRootSpan(
          `${rawPayload.topic} [${connectionName}]`,
        );

        const tags = {
          connectionName,
          topic: rawPayload.topic,
          partition: rawPayload.partition,
          offset: rawPayload.message.offset,
          currentAttempt,
          isFinalAttempt,
        };

        rootSpan.addTags(tags);

        const rawLogger = this.__logger.logger.child({
          ...tags,
          traceId: rootSpan.context().toTraceId(),
        });

        loggerStorage.run(new Store(rawLogger), () => {
          // eslint-disable-next-line n/callback-return
          callback().then(resolve).catch(reject);
        });
      });
    });
  }

  private __processMessage(options: IProcessMessageOptions): Promise<void> {
    return this.__prepareAsyncContext(options, () =>
      this.__processMessageInAsyncContext(options),
    );
  }

  private async __processMessageInAsyncContext({
    connectionName,
    messageHandler,
    rawPayload,
    isFinalAttempt,
  }: IProcessMessageOptions): Promise<void> {
    const rootSpan = this.__tracingService.getRootSpan();

    try {
      const payload: IKafkaConsumerPayload = {
        key: undefined,
        value: undefined,
        headers: {},
        rawPayload,
      };

      const context: IKafkaConsumerContext = {
        connectionName,
        kafkaOptions: this.__kafkaOptions,
        kafkaCoreProducer: this.__kafkaCoreProducer,
        kafkaCoreSchemaRegistry: this.__kafkaCoreSchemaRegistry,
        kafkaConsumerMessageHandlerLogger:
          this.__kafkaConsumerMessageHandlerLogger,
        isFinalAttempt,
      };

      const resultOrStream = await messageHandler(payload, context);

      if (isObservable(resultOrStream)) {
        await lastValueFrom(resultOrStream);
      }
    } catch (error) {
      this.__kafkaConsumerMessageHandlerLogger.error(this.__logger, error);

      throw error;
    } finally {
      rootSpan.finish();
    }
  }
}
