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

import { Injectable, Scope } from "@nestjs/common";
import { Producer } from "kafkajs";

import { IDecoratedProvider } from "~/src/decoratedProviders";

import { KafkaProducerCore } from "./kafkaProducerCore";

@Injectable({ scope: Scope.TRANSIENT })
export class KafkaProducer implements IDecoratedProvider {
  private __connectionName?: string;

  public constructor(private readonly __kafkaProducerCore: KafkaProducerCore) {}

  public get connectionName(): string {
    if (!this.__connectionName) {
      throw new Error(`"connectionName" in KafkaProducer must be initialized!`);
    }

    return this.__connectionName;
  }

  public set connectionName(value: string) {
    this.__connectionName = value;
  }

  public send(
    ...args: Parameters<Producer["send"]>
  ): ReturnType<Producer["send"]> {
    return this.__kafkaProducerCore.send(this.connectionName, ...args);
  }

  public sendBatch(
    ...args: Parameters<Producer["sendBatch"]>
  ): ReturnType<Producer["sendBatch"]> {
    return this.__kafkaProducerCore.sendBatch(this.connectionName, ...args);
  }
}
