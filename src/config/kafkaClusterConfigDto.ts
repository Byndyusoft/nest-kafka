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
  TransformToBoolean,
  TransformToNumber,
} from "@byndyusoft/class-validator-extended";
import { Transform } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { KafkaConfig } from "kafkajs";

type TSupportedSaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512";

interface ITransformedKafkaClusterConfig {
  readonly brokers: string[];
  readonly saslMechanism?: TSupportedSaslMechanism;
  readonly username?: string;
  readonly password?: string;
  readonly ssl?: boolean;
  readonly ca?: Buffer;
}

export class KafkaClusterConfigDto {
  public static toRawConfig(config: KafkaClusterConfigDto): KafkaConfig {
    const transformedConfig =
      config as unknown as ITransformedKafkaClusterConfig;

    const { brokers } = transformedConfig;

    return {
      brokers,
      connectionTimeout: config.connectionTimeout,
      ...this.getKafkaSslConfig(transformedConfig),
      ...this.getKafkaSaslConfig(transformedConfig),
    };
  }

  private static getKafkaSslConfig({
    ssl,
    ca,
  }: ITransformedKafkaClusterConfig): Pick<KafkaConfig, "ssl"> {
    if (!ssl && !ca) {
      return {
        ssl: false,
      };
    }

    if (!ca) {
      return {
        ssl: true,
      };
    }

    return {
      ssl: {
        rejectUnauthorized: true,
        requestCert: true,
        ca,
      },
    };
  }

  private static getKafkaSaslConfig({
    saslMechanism,
    username,
    password,
  }: ITransformedKafkaClusterConfig): Pick<KafkaConfig, "sasl"> {
    return !saslMechanism || !username || !password
      ? {}
      : {
          sasl: {
            mechanism: saslMechanism as "plain",
            username,
            password,
          },
        };
  }

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.split(",") : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public readonly brokers!: string | string[];

  @IsIn(["plain", "scram-sha-256", "scram-sha-512"])
  @IsOptional()
  public readonly saslMechanism?: string | TSupportedSaslMechanism;

  @IsString()
  @IsOptional()
  public readonly username?: string;

  @IsString()
  @IsOptional()
  public readonly password?: string;

  @TransformToBoolean()
  @IsBoolean()
  @IsOptional()
  public readonly ssl?: string | boolean;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? Buffer.from(value, "base64") : value,
  )
  @IsOptional()
  public readonly ca?: string | Buffer;

  @IsInt()
  @IsOptional()
  @TransformToNumber()
  public readonly connectionTimeout?: number;
}
