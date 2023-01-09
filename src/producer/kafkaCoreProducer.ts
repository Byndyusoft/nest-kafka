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
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Producer } from "kafkajs";

import { ProducersMapToken } from "../consts";

@Injectable()
export class KafkaCoreProducer implements OnModuleInit, OnModuleDestroy {
  public constructor(
    @Inject(ProducersMapToken)
    private readonly producersMap: Map<string, Producer>,
  ) {}

  public async onModuleDestroy(): Promise<void> {
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
    return this.getProducer(connectionName).send(...args);
  }

  public sendBatch(
    connectionName: string,
    ...args: Parameters<Producer["sendBatch"]>
  ): ReturnType<Producer["sendBatch"]> {
    return this.getProducer(connectionName).sendBatch(...args);
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
}
