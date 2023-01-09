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

import { SchemaRegistry } from "@kafkajs/confluent-schema-registry";
import { Injectable, Scope } from "@nestjs/common";

import { IDecoratedProvider } from "../decoratedProviders";

import { KafkaCoreSchemaRegistry } from "./kafkaCoreSchemaRegistry";

@Injectable({ scope: Scope.TRANSIENT })
export class KafkaSchemaRegistry implements IDecoratedProvider {
  private connectionNameValue?: string;

  public constructor(
    private readonly kafkaCoreSchemaRegistry: KafkaCoreSchemaRegistry,
  ) {}

  public get connectionName(): string {
    if (!this.connectionNameValue) {
      throw new Error(
        `"connectionName" in KafkaSchemaRegistry must be initialized!`,
      );
    }

    return this.connectionNameValue;
  }

  public set connectionName(value: string) {
    this.connectionNameValue = value;
  }

  public decode(
    ...args: Parameters<SchemaRegistry["decode"]>
  ): ReturnType<SchemaRegistry["decode"]> {
    return this.kafkaCoreSchemaRegistry.decode(this.connectionName, ...args);
  }

  public encode(
    ...args: Parameters<SchemaRegistry["encode"]>
  ): ReturnType<SchemaRegistry["encode"]> {
    return this.kafkaCoreSchemaRegistry.encode(this.connectionName, ...args);
  }

  public getLatestSchemaId(
    ...args: Parameters<SchemaRegistry["getLatestSchemaId"]>
  ): ReturnType<SchemaRegistry["getLatestSchemaId"]> {
    return this.kafkaCoreSchemaRegistry.getLatestSchemaId(
      this.connectionName,
      ...args,
    );
  }

  public getSchema(
    ...args: Parameters<SchemaRegistry["getSchema"]>
  ): ReturnType<SchemaRegistry["getSchema"]> {
    return this.kafkaCoreSchemaRegistry.getSchema(this.connectionName, ...args);
  }
}
