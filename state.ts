import { readJson } from './utils';

class GlobalState {
  private static instance: GlobalState;
  public isOn: boolean;
  public params: { [key: string]: any };

  private constructor() {
    this.isOn = false; // Initialize isOn to false
    this.params = readJson('param.json'); // Initialize params as an empty object
  }

  public static getInstance(): GlobalState {
    if (!GlobalState.instance) {
      GlobalState.instance = new GlobalState();
    }
    return GlobalState.instance;
  }

  public getIsOn(): boolean {
    return this.isOn;
  }

  public setIsOn(value: boolean): void {
    this.isOn = value;
  }

  public getParams(): { [key: string]: any } {
    return this.params;
  }

  public setParams(params: any): void {
    this.params = params;
  }

  public getState(): { isOn: boolean; params: { [key: string]: any } } {
    return {
      isOn: this.isOn,
      params: this.params,
    };
  }
}

const instance = GlobalState.getInstance();
Object.freeze(instance); // Prevent any changes to the instance
export default instance;
