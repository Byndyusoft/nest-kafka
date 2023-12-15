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

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ArgumentsHost,
  Catch,
  Logger,
  RpcExceptionFilter,
} from "@nestjs/common";
import { from, Observable, throwError } from "rxjs";

import {
  getErrorCause,
  KafkaConsumerError,
  KafkaConsumerNonRetriableError,
  KafkaConsumerRetriableError,
  serializeError,
} from "../errors";
import {
  IKafkaConsumerContext,
  IKafkaConsumerErrorTopicExceptionFilterOptions,
  IKafkaConsumerPayload,
} from "../interfaces";
import { DefaultRetryStrategy } from "../retryStrategies";

@Catch()
export class KafkaConsumerErrorTopicExceptionFilter
  implements RpcExceptionFilter
{
  private readonly errorTopicPicker: ((...args: any[]) => string) | false;

  private readonly logger = new Logger(
    KafkaConsumerErrorTopicExceptionFilter.name,
  );

  public constructor(
    private readonly options: IKafkaConsumerErrorTopicExceptionFilterOptions,
  ) {
    const errorTopicPicker = options.errorTopicPicker ?? options.topicPicker;

    if (errorTopicPicker === undefined) {
      throw new Error("errorTopicPicker must be defined");
    }

    this.errorTopicPicker = errorTopicPicker;
  }

  private static isExceptionRetriable(exception: unknown): boolean {
    return DefaultRetryStrategy.isRetriable(exception);
  }

  private static makeKafkaConsumerError(
    exception: unknown,
  ): KafkaConsumerError {
    if (exception instanceof KafkaConsumerError) {
      return exception;
    }

    return KafkaConsumerErrorTopicExceptionFilter.isExceptionRetriable(
      exception,
    )
      ? new KafkaConsumerRetriableError(exception)
      : new KafkaConsumerNonRetriableError(exception);
  }

  public catch(exception: unknown, host: ArgumentsHost): Observable<unknown> {
    const rpcHost = host.switchToRpc();
    const context: IKafkaConsumerContext = rpcHost.getContext();

    const kafkaConsumerError =
      KafkaConsumerErrorTopicExceptionFilter.makeKafkaConsumerError(exception);

    if (kafkaConsumerError.retriable && !context.isFinalAttempt) {
      return throwError(() => kafkaConsumerError);
    }

    context.kafkaConsumerMessageHandlerLogger.error(this.logger, exception);

    const topic = this.getTopicForResendMessage(context, kafkaConsumerError);

    if (topic === false) {
      return throwError(() => kafkaConsumerError);
    }

    return from(
      this.resendMessage(
        kafkaConsumerError,
        host,
        this.options.connectionName ?? context.connectionName,
        topic,
      ),
    );
  }

  private getTopicForResendMessage(
    context: IKafkaConsumerContext,
    kafkaConsumerError: KafkaConsumerError,
  ): string | false {
    const topic =
      kafkaConsumerError.retriable &&
      typeof this.options.retryTopicPicker === "function"
        ? this.options.retryTopicPicker
        : this.errorTopicPicker;

    if (!topic) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return topic(...context.kafkaOptions.topicPickerArgs);
  }

  private async resendMessage(
    kafkaConsumerError: KafkaConsumerError,
    host: ArgumentsHost,
    connectionName: string,
    topic: string,
  ): Promise<void> {
    const rpcHost = host.switchToRpc();
    const payload: IKafkaConsumerPayload = rpcHost.getData();
    const context: IKafkaConsumerContext = rpcHost.getContext();

    const cause = getErrorCause(kafkaConsumerError);

    this.logger.warn(`Send message to ${topic}`);

    await context.kafkaCoreProducer.send(connectionName, {
      topic,
      messages: [
        {
          key: payload.rawPayload.message.key,
          value: payload.rawPayload.message.value,
          headers: {
            ...payload.rawPayload.message.headers,
            originalTopic: payload.rawPayload.topic,
            originalPartition: String(payload.rawPayload.partition),
            originalOffset: payload.rawPayload.message.offset,
            originalTimestamp: payload.rawPayload.message.timestamp,
            error: JSON.stringify(serializeError(cause)),
          },
        },
      ],
    });
  }
}
