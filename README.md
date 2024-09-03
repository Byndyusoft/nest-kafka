# nest-kafka

[![npm@latest](https://img.shields.io/npm/v/@byndyusoft/nest-kafka/latest.svg)](https://www.npmjs.com/package/@byndyusoft/nest-kafka)
[![test](https://github.com/Byndyusoft/nest-kafka/actions/workflows/test.yaml/badge.svg?branch=master)](https://github.com/Byndyusoft/nest-kafka/actions/workflows/test.yaml)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

Kafka for NestJS

## Features

- Multiple connections
- Consumer and Producer with Schema Registry support (using [kafkajs](https://www.npmjs.com/package/kafkajs) and [@kafkajs/confluent-schema-registry](https://www.npmjs.com/package/@kafkajs/confluent-schema-registry) under the hood)
- Integration with [nest-template](https://github.com/Byndyusoft/nest-template)
- Consumer
  - Subscribe topic is not static, you can pick it from config
  - Process message in async context with [Tracing](https://www.npmjs.com/package/@byndyusoft/nest-opentracing) and [Logging](https://www.npmjs.com/package/@byndyusoft/nest-pino)
  - String, JSON and Schema Registry decoders for key and value, headers decoder with array support
  - [Dead letter queue](https://www.confluent.io/blog/error-handling-patterns-in-kafka/#pattern-2) pattern support with smart retry mechanism
  - Support custom decoders and error handling patterns

## Requirements

- Node.js v14 LTS or later
- Yarn

## Install

```bash
yarn add @byndyusoft/nest-kafka @byndyusoft/class-validator-extended @byndyusoft/nest-opentracing @byndyusoft/nest-pino @kafkajs/confluent-schema-registry @nestjs/common @nestjs/microservices class-transformer class-validator kafkajs rxjs
```

## Usage

### Init

<details>
<summary>1. Create <code>KafkaConfigDto</code></summary>

```typescript
import {
  KafkaClusterConfigDto,
  KafkaConsumerConfigDto,
  KafkaProducerConfigDto,
  KafkaSchemaRegistryArgsConfigDto,
} from "@byndyusoft/nest-kafka";
import { Type } from "class-transformer";
import { IsDefined, IsString, ValidateNested } from "class-validator";

export class KafkaConfigDto {
  @Type(() => KafkaClusterConfigDto)
  @IsDefined()
  @ValidateNested()
  public readonly cluster!: KafkaClusterConfigDto;

  @Type(() => KafkaConsumerConfigDto)
  @IsDefined()
  @ValidateNested()
  public readonly consumer!: KafkaConsumerConfigDto;

  @Type(() => KafkaProducerConfigDto)
  @IsDefined()
  @ValidateNested()
  public readonly producer!: KafkaProducerConfigDto;

  @Type(() => KafkaSchemaRegistryArgsConfigDto)
  @IsDefined()
  @ValidateNested()
  public readonly schemaRegistry!: KafkaSchemaRegistryArgsConfigDto;

  @IsString()
  public readonly topic!: string;

  @IsString()
  public readonly errorTopic!: string;
}
```

</details>

<details>
<summary>2. Add <code>KafkaConfigDto</code> into <code>ConfigDto</code></summary>

```typescript
import { Type } from "class-transformer";
import { IsDefined, ValidateNested } from "class-validator";

import { KafkaConfigDto } from "./kafkaConfigDto";

export class ConfigDto {
  /// ...

  @Type(() => KafkaConfigDto)
  @IsDefined()
  @ValidateNested()
  public readonly kafka!: KafkaConfigDto;

  /// ...
}
```

</details>

<details>
<summary>3. Add env variables mapping</summary>

```typescript
import { Module } from "@nestjs/common";

import { ConfigDto } from "./dtos";

@Module({})
export class ConfigModule {
  // ...

  private static __loadConfig(): ConfigDto {
    const plainConfig: ConfigDto = {
      // ...
      kafka: {
        cluster: {
          brokers: process.env.KAFKA_BROKERS as string,
          saslMechanism: process.env.KAFKA_SASL_MECHANISM,
          username: process.env.KAFKA_USERNAME,
          password: process.env.KAFKA_PASSWORD,
          ssl: process.env.KAFKA_SSL,
          ca: process.env.KAFKA_CA,
          connectionTimeout: process.env.KAFKA_CONNECTION_TIMEOUT, // default is 1 s.
        },
        consumer: {
          groupId: process.env.KAFKA_CONSUMER_GROUP_ID as string,
          allowAutoTopicCreation:
            process.env.KAFKA_CONSUMER_ALLOW_AUTO_TOPIC_CREATION ?? true,
          sessionTimeout: process.env.KAFKA_SESSION_TIMEOUT_MS ?? 30000,
          heartbeatInterval: process.env.KAFKA_HEARTBEAT_INTERVAL_MS ?? 3000,
        },
        producer: {
          allowAutoTopicCreation:
            process.env.KAFKA_PRODUCER_ALLOW_AUTO_TOPIC_CREATION ?? true,
        },
        schemaRegistry: {
          host: process.env.KAFKA_SCHEMA_REGISTRY_HOST as string,
          username: process.env.KAFKA_SCHEMA_REGISTRY_USERNAME,
          password: process.env.KAFKA_SCHEMA_REGISTRY_PASSWORD,
        },
        topic: process.env.KAFKA_TOPIC as string,
        errorTopic: process.env.KAFKA_ERROR_TOPIC as string,
      },
      // ...
    };

    // ...
  }
}
```

</details>

<details>
<summary>4. Import <code>KafkaModule</code></summary>

```typescript
import {
  KafkaClusterConfigDto,
  KafkaConsumerConfigDto,
  KafkaModule,
  KafkaProducerConfigDto,
  KafkaSchemaRegistryArgsConfigDto,
} from "@byndyusoft/nest-kafka";

import { ConfigDto } from "./config";

@Module({
  imports: [
    // Extra modules
    // ...
    KafkaModule.registerAsync({
      inject: [ConfigDto],
      useFactory: (config: ConfigDto) => ({
        connections: [
          {
            cluster: KafkaClusterConfigDto.toRawConfig(config.kafka.cluster),
            consumer: KafkaConsumerConfigDto.toRawConfig(config.kafka.consumer),
            producer: KafkaProducerConfigDto.toRawConfig(config.kafka.producer),
            schemaRegistry: {
              args: KafkaSchemaRegistryArgsConfigDto.toRawConfig(
                config.kafka.schemaRegistry,
              ),
            },
          },
        ],
        topicPickerArgs: [config],
      }),
    }),
    // ...
  ],
})
export class InfrastructureModule {
  // ...
}
```

</details>

<details>
<summary>4.1. You can describe multiple connections (farther use <code>connectionName</code> parameter in some functions to specify your connection)</summary>

```typescript
import {
  KafkaClusterConfigDto,
  KafkaConsumerConfigDto,
  KafkaModule,
  KafkaProducerConfigDto,
  KafkaSchemaRegistryArgsConfigDto,
} from "@byndyusoft/nest-kafka";

import { ConfigDto } from "./config";

@Module({
  imports: [
    // Extra modules
    // ...
    KafkaModule.registerAsync({
      inject: [ConfigDto],
      useFactory: (config: ConfigDto) => ({
        connections: [
          {
            name: "connection1",
            cluster: KafkaClusterConfigDto.toRawConfig(config.kafka1.cluster),
            consumer: KafkaConsumerConfigDto.toRawConfig(
              config.kafka1.consumer,
            ),
            producer: KafkaProducerConfigDto.toRawConfig(
              config.kafka1.producer,
            ),
            schemaRegistry: {
              args: KafkaSchemaRegistryArgsConfigDto.toRawConfig(
                config.kafka1.schemaRegistry,
              ),
            },
          },
          {
            name: "connection2",
            cluster: KafkaClusterConfigDto.toRawConfig(config.kafka2.cluster),
            consumer: KafkaConsumerConfigDto.toRawConfig(
              config.kafka2.consumer,
            ),
            producer: KafkaProducerConfigDto.toRawConfig(
              config.kafka2.producer,
            ),
            schemaRegistry: {
              args: KafkaSchemaRegistryArgsConfigDto.toRawConfig(
                config.kafka2.schemaRegistry,
              ),
            },
          },
        ],
        topicPickerArgs: [config],
      }),
    }),
    // ...
  ],
})
export class InfrastructureModule {
  // ...
}
```

</details>

<details>
<summary>4.2. If you want, you can not create <code>consumer</code>, <code>producer</code> or <code>schemaRegistry</code></summary>

```typescript
import {
  KafkaClusterConfigDto,
  KafkaConsumerConfigDto,
  KafkaModule,
  KafkaProducerConfigDto,
  KafkaSchemaRegistryArgsConfigDto,
} from "@byndyusoft/nest-kafka";

import { ConfigDto } from "./config";

@Module({
  imports: [
    // Extra modules
    // ...
    KafkaModule.registerAsync({
      inject: [ConfigDto],
      useFactory: (config: ConfigDto) => ({
        connections: [
          {
            cluster: KafkaClusterConfigDto.toRawConfig(config.kafka.cluster),
            consumer: KafkaConsumerConfigDto.toRawConfig(config.kafka.consumer),
          },
        ],
        topicPickerArgs: [config],
      }),
    }),
    // ...
  ],
})
export class InfrastructureModule {
  // ...
}
```

</details>

<details>
<summary>5. Connect microservice to start consuming messages</summary>

```typescript
import { KafkaConsumer, KafkaRetryConsumer } from "@byndyusoft/nest-kafka";
import { MicroserviceOptions } from "@nestjs/microservices";

async function bootstrap(): Promise<void> {
  // ...

  app.connectMicroservice<MicroserviceOptions>({
    strategy: app.get(KafkaConsumer),
  });

  // you can optionally connect retry consumer
  app.connectMicroservice<MicroserviceOptions>({
    strategy: app.get(KafkaRetryConsumer),
  });

  await app.startAllMicroservices();

  // ...

  await app.listen(...)
}

// ...
```

</details>

### Consuming Messages

> [!IMPORTANT]
> Put `app.startAllMicroservices()` after your `app.listen(...)`

</details>

<details>
<summary>1. Create controller and use <code>KafkaConsumerEventPattern</code> to describe consumer</summary>

```typescript
import {
  IKafkaConsumerPayload,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";

import { ConfigDto } from "~/src";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  public async onMessage(
    @Payload() payload: IKafkaConsumerPayload,
  ): Promise<void> {
    // ...
  }
}
```

</details>

</details>

<details>
<summary>2. Decode payload</summary>

```typescript
import {
  IKafkaConsumerPayload,
  KafkaConsumerEventPattern,
  KafkaConsumerPayloadDecoder,
} from "@byndyusoft/nest-kafka";
import { Controller, UseInterceptors } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";

import { ConfigDto } from "~/src";
import { UserDto } from "ᐸDtosᐳ";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseInterceptors(
    new KafkaConsumerPayloadDecoder({
      key: "string",
      value: "json",
      headers: "string",
    }),
  )
  public async onMessage(
    @Payload() payload: IKafkaConsumerPayload<string, UserDto>,
  ): Promise<void> {
    // ...
  }
}
```

</details>

<details>
<summary>2.1. You can use param decorators to get key, value or headers</summary>

```typescript
import {
  IKafkaConsumerPayloadHeaders,
  KafkaConsumerEventPattern,
  KafkaConsumerPayloadDecoder,
  KafkaHeaders,
  KafkaKey,
  KafkaValue,
} from "@byndyusoft/nest-kafka";
import { Controller, UseInterceptors } from "@nestjs/common";

import { ConfigDto } from "~/src";
import { UserDto } from "ᐸDtosᐳ";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseInterceptors(
    new KafkaConsumerPayloadDecoder({
      key: "string",
      value: "json",
      headers: "string",
    }),
  )
  public async onMessage(
    @KafkaKey() key: string,
    @KafkaValue() value: UserDto,
    @KafkaHeaders() headers: IKafkaConsumerPayloadHeaders,
  ): Promise<void> {
    // ...
  }
}
```

</details>

<details>
<summary>3. Always use some exception filter for correct error handling</summary>

```typescript
import {
  KafkaConsumerBaseExceptionFilter,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller, UseFilters } from "@nestjs/common";

import { ConfigDto } from "~/src";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseFilters(/* ... */)
  public async onMessage(): Promise<void> {
    throw new Error("some error");
  }
}
```

</details>

<details>
<summary>3.1. Use <code>KafkaConsumerBaseExceptionFilter</code> if you prefer <a href="https://www.confluent.io/blog/error-handling-patterns-in-kafka/#pattern-1">Stop on error</a> pattern</summary>

```typescript
import {
  KafkaConsumerBaseExceptionFilter,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller, UseFilters } from "@nestjs/common";

import { ConfigDto } from "~/src";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseFilters(new KafkaConsumerBaseExceptionFilter())
  public async onMessage(): Promise<void> {
    throw new Error("some error");
  }
}
```

</details>

<details>
<summary>3.2. Use <code>KafkaConsumerErrorTopicExceptionFilter</code> if you prefer <a href="https://www.confluent.io/blog/error-handling-patterns-in-kafka/#pattern-2">Dead letter queue</a> pattern</summary>

```typescript
import {
  KafkaConsumerErrorTopicExceptionFilter,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller, UseFilters } from "@nestjs/common";

import { ConfigDto } from "~/src";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseFilters(
    new KafkaConsumerErrorTopicExceptionFilter({
      errorTopicPicker: (config: ConfigDto) => config.kafka.errorTopic,
    }),
  )
  public async onMessage(): Promise<void> {
    throw new Error("some error");
  }
}
```

</details>

<details>
<summary>3.3. <code>KafkaConsumerErrorTopicExceptionFilter</code> also support retry topic for retriable errors</summary>

```typescript
import {
  KafkaConsumerErrorTopicExceptionFilter,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller, UseFilters } from "@nestjs/common";

import { ConfigDto } from "~/src";

@Controller()
export class UsersConsumer {
  @KafkaConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.topic,
    fromBeginning: true,
  })
  @UseFilters(
    new KafkaConsumerErrorTopicExceptionFilter({
      retryTopicPicker: (config: ConfigDto) => config.kafka.retryTopic,
      errorTopicPicker: (config: ConfigDto) => config.kafka.errorTopic,
    }),
  )
  public async onMessage(): Promise<void> {
    throw new Error("some error");
  }
}
```

</details>

<details>
<summary>3.4. Use retry consumer to consume messages from retry topic</summary>

```typescript
import {
  KafkaConsumerErrorTopicExceptionFilter,
  KafkaConsumerEventPattern,
} from "@byndyusoft/nest-kafka";
import { Controller, UseFilters } from "@nestjs/common";

import { ConfigDto } from "~/src";

@Controller()
export class UsersRetryConsumer {
  @KafkaRetryConsumerEventPattern({
    topicPicker: (config: ConfigDto) => config.kafka.retryTopic,
    fromBeginning: true,
  })
  @UseFilters(
    new KafkaConsumerErrorTopicExceptionFilter({
      retryTopicPicker: false,
      errorTopicPicker: (config: ConfigDto) => config.kafka.errorTopic,
      resendHeadersPrefix: "retry",
    }),
  )
  public async onMessage(): Promise<void> {
    throw new Error("some error");
  }
}
```

Run retry consumer, e.g by HTTP:

```typescript
import { ApiTags } from "@byndyusoft/nest-swagger";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { ApiCommonResponses } from "../infrastructure";

import { RunDeliveryAppointmentsRetryConsumerOnceBodyDto } from "./dtos";
import { RunDeliveryAppointmentsRetryConsumerOnceUseCase } from "./useCases";

@ApiTags("Users")
@Controller({
  path: "/users/retry",
  version: "1",
})
export class UsersRetryController {
  public constructor(
    private readonly config: ConfigDto,
    private readonly kafkaRetryConsumer: KafkaRetryConsumer,
  ) {}

  @ApiCommonResponses(HttpStatus.BAD_REQUEST)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("/runRetryConsumerOnce")
  public runDeliveryAppointmentsRetryConsumerOnce(): Promise<void> {
    await this.kafkaRetryConsumer.runOnce({
      topic: config.kafka.retryTopic,
      messagesCount: 1,
    });
  }
}
```

</details>

### Producing Messages

</details>

<details>
<summary>1. Inject <code>KafkaProducer</code></summary>

```typescript
import { InjectKafkaProducer, KafkaProducer } from "@byndyusoft/nest-kafka";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
  public constructor(
    @InjectKafkaProducer()
    private readonly __kafkaProducer: KafkaProducer,
  ) {}
}
```

</details>

### Schema Registry

</details>

<details>
<summary>1. Inject <code>KafkaSchemaRegistry</code></summary>

```typescript
import {
  InjectKafkaSchemaRegistry,
  KafkaSchemaRegistry,
} from "@byndyusoft/nest-kafka";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
  public constructor(
    @InjectKafkaSchemaRegistry()
    private readonly __kafkaSchemaRegistry: KafkaSchemaRegistry,
  ) {}
}
```

</details>

## Maintainers

- [@Byndyusoft/owners](https://github.com/orgs/Byndyusoft/teams/owners) <<github.maintain@byndyusoft.com>>
- [@Byndyusoft/team](https://github.com/orgs/Byndyusoft/teams/team)
- [@KillWolfVlad](https://github.com/KillWolfVlad)

## License

This repository is released under version 2.0 of the
[Apache License](https://www.apache.org/licenses/LICENSE-2.0).
