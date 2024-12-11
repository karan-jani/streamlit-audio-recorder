declare module 'streamlit-component-lib' {
  import { ReactNode } from 'react';

  export class StreamlitComponentBase<State = any> {
    constructor(props: any);
    state: State;
    render(): ReactNode;
  }

  export function withStreamlitConnection(component: any): any;

  export const Streamlit: {
    setComponentValue: (value: any) => void;
    setComponentReady: () => void;
    setFrameHeight: (height?: number) => void;
  };
} 