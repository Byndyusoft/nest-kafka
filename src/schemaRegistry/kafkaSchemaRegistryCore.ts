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
import { Inject, Injectable } from "@nestjs/common";

import { SchemaRegistriesMapToken } from "~/src/consts";

@Injectable()
export class KafkaSchemaRegistryCore {
  public constructor(
    @Inject(SchemaRegistriesMapToken)
    private readonly __schemaRegistriesMap: Map<string, SchemaRegistry>,
  ) {}

  public decode(
    connectionName: string,
    ...args: Parameters<SchemaRegistry["decode"]>
  ): ReturnType<SchemaRegistry["decode"]> {
    return this.__getSchemaRegistry(connectionName).decode(...args);
  }

  public encode(
    connectionName: string,
    ...args: Parameters<SchemaRegistry["encode"]>
  ): ReturnType<SchemaRegistry["encode"]> {
    return this.__getSchemaRegistry(connectionName).encode(...args);
  }

  public getLatestSchemaId(
    connectionName: string,
    ...args: Parameters<SchemaRegistry["getLatestSchemaId"]>
  ): ReturnType<SchemaRegistry["getLatestSchemaId"]> {
    return this.__getSchemaRegistry(connectionName).getLatestSchemaId(...args);
  }

  public getSchema(
    connectionName: string,
    ...args: Parameters<SchemaRegistry["getSchema"]>
  ): ReturnType<SchemaRegistry["getSchema"]> {
    return this.__getSchemaRegistry(connectionName).getSchema(...args);
  }

  private __getSchemaRegistry(connectionName: string): SchemaRegistry {
    const schemaRegistry = this.__schemaRegistriesMap.get(connectionName);

    if (!schemaRegistry) {
      throw new Error(
        `SchemaRegistry for connection name "${connectionName}" doesn't exists!`,
      );
    }

    return schemaRegistry;
  }
}
