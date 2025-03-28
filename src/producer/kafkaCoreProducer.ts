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

import { Span, TracingService } from "@byndyusoft/nest-opentracing";
import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import {
  Producer,
  ProducerRecord,
  RecordMetadata,
  TopicMessages,
} from "kafkajs";

import { ProducersMapToken } from "../consts";

@Injectable()
export class KafkaCoreProducer implements OnModuleInit, OnApplicationShutdown {
  public constructor(
    @Inject(ProducersMapToken)
    private readonly producersMap: Map<string, Producer>,
    private readonly tracingService: TracingService,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.producersMap.values()].map((x) => x.disconnect()),
    );
  }

  public async onModuleInit(): Promise<void> {
    await Promise.all([...this.producersMap.values()].map((x) => x.connect()));
  }

  public send(
    connectionName: string,
    ...args: Parameters<Producer["send"]>
  ): ReturnType<Producer["send"]> {
    return this.tracingService.traceAsyncFunction(
      "kafka",
      async (span: Span) => {
        const result = await this.getProducer(connectionName).send(...args);

        this.startChildSpan(span, args, connectionName, result);

        return result;
      },
    );
  }

  public sendBatch(
    connectionName: string,
    ...args: Parameters<Producer["sendBatch"]>
  ): ReturnType<Producer["sendBatch"]> {
    return this.tracingService.traceAsyncFunction(
      "kafka",
      async (span: Span) => {
        const result = await this.getProducer(connectionName).sendBatch(
          ...args,
        );

        for (const argumentX of Object.values(args)) {
          this.startChildSpan(
            span,
            argumentX.topicMessages!,
            connectionName,
            result,
          );
        }

        return result;
      },
    );
  }

  private getProducer(connectionName: string): Producer {
    const producer = this.producersMap.get(connectionName);

    if (!producer) {
      throw new Error(
        `Producer for connection name "${connectionName}" doesn't exists!`,
      );
    }

    return producer;
  }

  private startChildSpan(
    span: Span,
    args: [record: ProducerRecord] | TopicMessages[],
    connectionName: string,
    result: RecordMetadata[],
  ): void {
    span.addTags({
      "connection.name": connectionName,
      "topic.count": args.length,
    });

    for (const [_, argument] of args.entries()) {
      const topicSpan = span
        .tracer()
        .startSpan(`kafka.topic.${argument.topic}`, {
          childOf: span,
        });

      topicSpan.addTags({
        "connection.name": connectionName,
        topic: argument.topic,
      });

      if (result.length === args.length) {
        topicSpan.addTags({
          partitions:
            result.length === args.length ? result[_].partition : null,
          "base.offset":
            result.length === args.length ? result[_].baseOffset : null,
        });
      }

      for (const message of argument.messages) {
        topicSpan.setTag("message.key", message.key);
      }

      topicSpan.finish();
    }
  }
}
