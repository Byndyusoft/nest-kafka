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

import { Provider, Type } from "@nestjs/common";

import { IDecoratedProvider } from "./decoratedProviderInterface";

export class DecoratedProviders {
  private readonly __providersMap: Map<string, symbol> = new Map();

  public constructor(
    private readonly __decoratedProviderClass: Type<IDecoratedProvider>,
  ) {}

  public createProviders(): Provider[] {
    return [...this.__providersMap.entries()].map(
      ([connectionName, token]) => ({
        provide: token,
        inject: [this.__decoratedProviderClass],
        useFactory(decoratedProvider: IDecoratedProvider) {
          decoratedProvider.connectionName = connectionName;

          return decoratedProvider;
        },
      }),
    );
  }

  public getToken(connectionName: string): symbol {
    if (!this.__providersMap.has(connectionName)) {
      this.__providersMap.set(
        connectionName,
        Symbol(`${this.__decoratedProviderClass.name}-${connectionName}`),
      );
    }

    return this.__providersMap.get(connectionName)!;
  }
}
