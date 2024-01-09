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

import { ConsumerConfig, KafkaConfig, ProducerConfig } from "kafkajs";

import { IKafkaSchemaRegistryConnection } from "./kafkaSchemaRegistryConnectionInterface";

export interface IKafkaConnection {
  readonly name?: string;

  readonly cluster: KafkaConfig;

  readonly consumer?: ConsumerConfig;

  readonly retryConsumer?: ConsumerConfig;

  readonly producer?: ProducerConfig;

  readonly schemaRegistry?: IKafkaSchemaRegistryConnection;
}
