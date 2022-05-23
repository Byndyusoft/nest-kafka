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

import { IKafkaOptions } from "~/src/options";
import { KafkaProducerCore } from "~/src/producer";
import { KafkaSchemaRegistryCore } from "~/src/schemaRegistry";

import { KafkaConsumerMessageHandlerLogger } from "../kafkaConsumerMessageHandlerLogger";

export interface IKafkaConsumerContext {
  readonly connectionName: string;
  readonly kafkaOptions: IKafkaOptions;

  readonly kafkaProducerCore: KafkaProducerCore;
  readonly kafkaSchemaRegistryCore: KafkaSchemaRegistryCore;

  readonly kafkaConsumerMessageHandlerLogger: KafkaConsumerMessageHandlerLogger;

  readonly isFinalAttempt: boolean;
}
