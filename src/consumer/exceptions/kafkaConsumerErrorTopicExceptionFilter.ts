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
  private readonly logger = new Logger(
    KafkaConsumerErrorTopicExceptionFilter.name,
  );

  public constructor(
    private readonly options: IKafkaConsumerErrorTopicExceptionFilterOptions,
  ) {}

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

    return from(
      this.sendMessageToErrorTopic(
        kafkaConsumerError,
        host,
        this.options.connectionName ?? context.connectionName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.options.topicPicker(...context.kafkaOptions.topicPickerArgs),
      ),
    );
  }

  private async sendMessageToErrorTopic(
    kafkaConsumerError: KafkaConsumerError,
    host: ArgumentsHost,
    connectionName: string,
    topic: string,
  ): Promise<void> {
    const rpcHost = host.switchToRpc();
    const payload: IKafkaConsumerPayload = rpcHost.getData();
    const context: IKafkaConsumerContext = rpcHost.getContext();

    const cause = getErrorCause(kafkaConsumerError);

    this.logger.warn("Send message to error topic");

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
