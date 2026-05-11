declare module "*?worker" {
  const Worker: new () => globalThis.Worker;
  export default Worker;
}
