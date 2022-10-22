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
  DynamicModuleHelper,
  TRegisterAsyncOptions,
} from "@byndyusoft/nest-dynamic-module";
import { SchemaRegistry } from "@kafkajs/confluent-schema-registry";
import { DynamicModule, Logger, Module } from "@nestjs/common";
import { Consumer, Kafka, KafkaConfig, logLevel, Producer } from "kafkajs";
import _ from "lodash";

import {
  ConsumersMapToken,
  DefaultConnectionName,
  KafkaBaseOptionsToken,
  KafkaOptionsToken,
  ProducersMapToken,
  SchemaRegistriesMapToken,
} from "./consts";
import {
  KafkaConsumer,
  KafkaConsumerMessageHandler,
  KafkaConsumerMessageHandlerLogger,
} from "./consumer";
import { IKafkaOptions } from "./options";
import {
  KafkaCoreProducer,
  KafkaProducer,
  kafkaProducerDecoratedProviders,
} from "./producer";
import {
  KafkaCoreSchemaRegistry,
  KafkaSchemaRegistry,
  kafkaSchemaRegistryDecoratedProviders,
} from "./schemaRegistry";

@Module({})
export class KafkaModule {
  public static registerAsync(
    options?: TRegisterAsyncOptions<IKafkaOptions>,
  ): DynamicModule {
    const providers = [
      KafkaConsumer,
      KafkaConsumerMessageHandler,
      KafkaConsumerMessageHandlerLogger,
      KafkaCoreProducer,
      KafkaCoreSchemaRegistry,
      KafkaProducer,
      KafkaSchemaRegistry,
      ...kafkaProducerDecoratedProviders.createProviders(),
      ...kafkaSchemaRegistryDecoratedProviders.createProviders(),
    ];

    return DynamicModuleHelper.registerAsync(
      {
        module: KafkaModule,
        global: true,
        providers: [
          {
            provide: KafkaOptionsToken,
            inject: [KafkaBaseOptionsToken],
            useFactory: (kafkaOptions: IKafkaOptions) =>
              KafkaModule.kafkaOptionsFactory(kafkaOptions),
          },
          {
            provide: ConsumersMapToken,
            inject: [KafkaOptionsToken],
            useFactory: (kafkaOptions: IKafkaOptions) =>
              KafkaModule.consumersMapTokenFactory(kafkaOptions),
          },
          {
            provide: ProducersMapToken,
            inject: [KafkaOptionsToken],
            useFactory: (kafkaOptions: IKafkaOptions) =>
              KafkaModule.producersMapTokenFactory(kafkaOptions),
          },
          {
            provide: SchemaRegistriesMapToken,
            inject: [KafkaOptionsToken],
            useFactory: (kafkaOptions: IKafkaOptions) =>
              KafkaModule.schemaRegistriesMapTokenFactory(kafkaOptions),
          },
          ...providers,
        ],
        exports: providers,
      },
      KafkaBaseOptionsToken,
      options,
    );
  }

  private static consumersMapTokenFactory(
    kafkaOptions: IKafkaOptions,
  ): Map<string, Consumer> {
    return new Map(
      kafkaOptions.connections
        .filter((x) => x.consumer)
        .map((x) => [
          x.name ?? DefaultConnectionName,
          new Kafka(x.cluster).consumer(x.consumer!),
        ]),
    );
  }

  private static getKafkaLogger(
    connectionName: string,
  ): Pick<KafkaConfig, "logLevel" | "logCreator"> {
    const logger = new Logger(`kafkajs-${connectionName}`);

    return {
      logLevel: logLevel.DEBUG,
      logCreator() {
        return (entry) => {
          if (entry.level === logLevel.NOTHING) {
            return;
          }

          let methodName: "debug" | "log" | "warn" | "error";
          switch (entry.level) {
            case logLevel.DEBUG:
              methodName = "debug";
              break;
            case logLevel.INFO:
              methodName = "log";
              break;
            case logLevel.WARN:
              methodName = "warn";
              break;
            case logLevel.ERROR:
              methodName = "error";
              break;
          }

          logger[methodName](
            _.omit(
              {
                namespace: entry.namespace,
                ...entry.log,
              },
              "logger",
              "message",
              "timestamp",
            ),
            entry.log.message,
          );
        };
      },
    };
  }

  private static kafkaOptionsFactory(
    kafkaOptions: IKafkaOptions,
  ): IKafkaOptions {
    return {
      ...kafkaOptions,
      connections: kafkaOptions.connections.map((connection) => ({
        ...connection,
        cluster: {
          ...connection.cluster,
          ...(!connection.cluster.logLevel && !connection.cluster.logCreator
            ? KafkaModule.getKafkaLogger(
                connection.name ?? DefaultConnectionName,
              )
            : {}),
        },
      })),
      consumerRetryOptions: kafkaOptions.consumerRetryOptions ?? {
        retries: 3,
      },
    };
  }

  private static producersMapTokenFactory(
    kafkaOptions: IKafkaOptions,
  ): Map<string, Producer> {
    return new Map(
      kafkaOptions.connections
        .filter((x) => x.producer)
        .map((x) => [
          x.name ?? DefaultConnectionName,
          new Kafka(x.cluster).producer(x.producer),
        ]),
    );
  }

  private static schemaRegistriesMapTokenFactory(
    kafkaOptions: IKafkaOptions,
  ): Map<string, SchemaRegistry> {
    return new Map(
      kafkaOptions.connections
        .filter((x) => x.schemaRegistry)
        .map((x) => [
          x.name ?? DefaultConnectionName,
          new SchemaRegistry(x.schemaRegistry!.args, x.schemaRegistry!.options),
        ]),
    );
  }
}
