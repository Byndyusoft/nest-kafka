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
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { IHeaders } from "kafkajs";
import { Observable } from "rxjs";

import {
  IKafkaConsumerContext,
  IKafkaConsumerPayload,
  IKafkaConsumerPayloadDecoderOptions,
  IKafkaConsumerPayloadHeaders,
} from "../interfaces";

@Injectable()
export class KafkaConsumerPayloadDecoder implements NestInterceptor {
  public constructor(
    private readonly options: IKafkaConsumerPayloadDecoderOptions,
  ) {}

  private static decodeHeaders(
    data?: IHeaders,
    decoder?: "string",
  ): IKafkaConsumerPayloadHeaders {
    if (!data || !decoder) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        const isArray = Array.isArray(value);

        const decodedValue = [value]
          .flat()
          .map((x) => (x as Buffer).toString());

        return [key, isArray ? decodedValue : decodedValue[0]];
      }),
    );
  }

  public async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const rpcHost = executionContext.switchToRpc();
    const context: IKafkaConsumerContext = rpcHost.getContext();
    const payload: IKafkaConsumerPayload = rpcHost.getData();

    payload.key = await this.decodeKeyOrValue(
      context,
      payload.rawPayload.message.key,
      this.options.key,
    );

    payload.value = await this.decodeKeyOrValue(
      context,
      payload.rawPayload.message.value,
      this.options.value,
    );

    payload.headers = KafkaConsumerPayloadDecoder.decodeHeaders(
      payload.rawPayload.message.headers,
      this.options.headers,
    );

    return next.handle();
  }

  private async decodeKeyOrValue(
    {
      connectionName: contextConnectionName,
      kafkaCoreSchemaRegistry,
    }: IKafkaConsumerContext,
    data: Buffer | null,
    decoder?: "string" | "json" | "schemaRegistry",
  ): Promise<unknown | undefined> {
    if (!data || !decoder) {
      return undefined;
    }

    const connectionName = this.options.connectionName ?? contextConnectionName;

    switch (decoder) {
      case "string":
        return data.toString();
      case "json":
        return JSON.parse(data.toString()) as unknown;
      case "schemaRegistry":
        return kafkaCoreSchemaRegistry.decode(connectionName, data);
    }
  }
}
