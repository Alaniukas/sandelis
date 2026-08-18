/** Kliento vėliava: peržiūros paskyra nekeičia localStorage ir nesiunčia į serverį. */
let writeEnabled = true;

export function setWmsWriteEnabled(enabled: boolean) {
  writeEnabled = enabled;
}

export function isWmsWriteEnabled() {
  return writeEnabled;
}
