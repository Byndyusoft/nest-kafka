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

import { KafkaCoreProducer } from "./kafkaCoreProducer";

@Injectable({ scope: Scope.TRANSIENT })
export class KafkaProducer implements IDecoratedProvider {
  private connectionNameValue?: string;

  public constructor(private readonly kafkaCoreProducer: KafkaCoreProducer) {}

  public get connectionName(): string {
    if (!this.connectionNameValue) {
      throw new Error(`"connectionName" in KafkaProducer must be initialized!`);
    }

    return this.connectionNameValue;
  }

  public set connectionName(value: string) {
    this.connectionNameValue = value;
  }

  public send(
    ...args: Parameters<Producer["send"]>
  ): ReturnType<Producer["send"]> {
    return this.kafkaCoreProducer.send(this.connectionName, ...args);
  }

  public sendBatch(
    ...args: Parameters<Producer["sendBatch"]>
  ): ReturnType<Producer["sendBatch"]> {
    return this.kafkaCoreProducer.sendBatch(this.connectionName, ...args);
  }
}
