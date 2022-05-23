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

import { HttpStatus } from "@nestjs/common";
import axios from "axios";

export class AxiosRetryStrategy {
  // See https://stackoverflow.com/questions/51770071/what-are-the-http-codes-to-automatically-retry-the-request
  private static readonly __retriableStatuses = new Set([
    // 4xx
    HttpStatus.REQUEST_TIMEOUT,
    HttpStatus.TOO_MANY_REQUESTS,
    // 5xx
    HttpStatus.INTERNAL_SERVER_ERROR, // e.g. when we can't connect to DB
    HttpStatus.BAD_GATEWAY,
    HttpStatus.SERVICE_UNAVAILABLE,
    HttpStatus.GATEWAY_TIMEOUT,
  ]);

  public static isRetriable(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;

    if (!status) {
      return false;
    }

    return AxiosRetryStrategy.__retriableStatuses.has(status);
  }
}
