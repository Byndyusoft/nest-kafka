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
import { PinoLogger } from "@byndyusoft/nest-pino";
import { storage as loggerStorage, Store } from "@byndyusoft/nest-pino/storage";
import { Inject, Injectable } from "@nestjs/common";
import { MessageHandler } from "@nestjs/microservices";
import { EachMessagePayload } from "kafkajs";
import retry from "retry";
import { isObservable, lastValueFrom } from "rxjs";

import { KafkaOptionsToken } from "../consts";
import { IKafkaOptions } from "../options";
import { KafkaCoreProducer } from "../producer";
import { KafkaCoreSchemaRegistry } from "../schemaRegistry";

import { getErrorCause, KafkaConsumerError } from "./errors";
import { IKafkaConsumerContext, IKafkaConsumerPayload } from "./interfaces";
import { KafkaConsumerMessageHandlerLogger } from "./kafkaConsumerMessageHandlerLogger";

interface IProcessMessageOptions {
  readonly connectionName: string;
  readonly messageHandler: MessageHandler<
    IKafkaConsumerPayload,
    IKafkaConsumerContext,
    unknown
  >;
  readonly rawPayload: EachMessagePayload;
  readonly currentAttempt: number;
  readonly isFinalAttempt: boolean;
}

@Injectable()
export class KafkaConsumerMessageHandler {
  private readonly totalAttempts: number;

  public constructor(
    private readonly kafkaConsumerMessageHandlerLogger: KafkaConsumerMessageHandlerLogger,
    private readonly kafkaCoreProducer: KafkaCoreProducer,
    private readonly kafkaCoreSchemaRegistry: KafkaCoreSchemaRegistry,
    @Inject(KafkaOptionsToken)
    private readonly kafkaOptions: IKafkaOptions,
    private readonly logger: PinoLogger,
    private readonly tracingAsyncContext: TracingAsyncContext,
    private readonly tracingService: TracingService,
  ) {
    this.logger.setContext(KafkaConsumerMessageHandler.name);

    this.totalAttempts =
      (this.kafkaOptions.consumerRetryOptions?.retries ?? 10) + 1;
  }

  public handleMessage(
    connectionName: string,
    messageHandler: MessageHandler,
    rawPayload: EachMessagePayload,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const operation = retry.operation(this.kafkaOptions.consumerRetryOptions);

      operation.attempt((currentAttempt) => {
        this.processMessage({
          connectionName,
          messageHandler,
          rawPayload,
          currentAttempt,
          isFinalAttempt: currentAttempt === this.totalAttempts,
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

  private prepareAsyncContext(
    {
      connectionName,
      rawPayload,
      currentAttempt,
      isFinalAttempt,
    }: IProcessMessageOptions,
    callback: () => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tracingAsyncContext.run(() => {
        const rootSpan = this.tracingService.initRootSpan(
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

        const rawLogger = this.logger.logger.child({
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

  private processMessage(options: IProcessMessageOptions): Promise<void> {
    return this.prepareAsyncContext(options, () =>
      this.processMessageInAsyncContext(options),
    );
  }

  private async processMessageInAsyncContext({
    connectionName,
    messageHandler,
    rawPayload,
    isFinalAttempt,
  }: IProcessMessageOptions): Promise<void> {
    const rootSpan = this.tracingService.getRootSpan();

    try {
      const payload: IKafkaConsumerPayload = {
        key: undefined,
        value: undefined,
        headers: {},
        rawPayload,
      };

      const context: IKafkaConsumerContext = {
        connectionName,
        kafkaOptions: this.kafkaOptions,
        kafkaCoreProducer: this.kafkaCoreProducer,
        kafkaCoreSchemaRegistry: this.kafkaCoreSchemaRegistry,
        kafkaConsumerMessageHandlerLogger:
          this.kafkaConsumerMessageHandlerLogger,
        isFinalAttempt,
        traceId: rootSpan.context().toTraceId(),
      };

      const resultOrStream = await messageHandler(payload, context);

      if (isObservable(resultOrStream)) {
        await lastValueFrom(resultOrStream);
      }
    } catch (error) {
      this.kafkaConsumerMessageHandlerLogger.error(this.logger, error);

      throw error;
    } finally {
      rootSpan.finish();
    }
  }
}
