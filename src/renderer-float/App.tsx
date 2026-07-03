import React from "react";
import { WaveOrb } from "./components/WaveOrb";
import { useDiriState } from "./hooks/useDiriState";

export default function App() {
  const { state, visible } = useDiriState();
  return <WaveOrb state={state} visible={visible} />;
}
