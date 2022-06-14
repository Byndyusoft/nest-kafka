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

import { Tags, TracingService } from "@byndyusoft/nest-opentracing";
import { Injectable, LoggerService } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { getCauseError, serializeError } from "./errors";

@Injectable()
export class KafkaConsumerMessageHandlerLogger {
  public constructor(private readonly __tracingService: TracingService) {}

  public error(logger: LoggerService | PinoLogger, error: unknown): void {
    const rootSpan = this.__tracingService.getRootSpan();

    const cause = getCauseError(error);

    logger.error(cause);

    rootSpan.setTag(Tags.ERROR, true);
    rootSpan.setTag(Tags.SAMPLING_PRIORITY, 1);

    rootSpan.log({
      event: "error",
      ...serializeError(cause),
    });
  }
}
