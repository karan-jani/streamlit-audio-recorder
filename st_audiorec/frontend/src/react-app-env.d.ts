/// <reference types="react-scripts" />
declare module 'audio-react-recorder';

/// <reference types="react" />

declare module 'streamlit-component-lib' {
  export class StreamlitComponentBase {
    constructor(props: any);
    setState: any;
    state: any;
    props: any;
  }
  export function withStreamlitConnection(component: any): any;
  export const Streamlit: any;
}
