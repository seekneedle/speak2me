// Type definitions for @nlpjs/core
declare module '@nlpjs/core' {
  export class Container {
    register(name: string, value: any): void;
    get(name: string): any;
  }

  export class Plugin {
    constructor(container?: Container);
  }

  export function containerBootstrap(): Container;
}
