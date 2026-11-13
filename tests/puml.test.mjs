import assert from 'node:assert/strict';
import { encodePlantUml } from '../host/puml.js';

assert.equal(
  encodePlantUml('@startuml\nAlice -> Bob: hello\n@enduml'),
  'U9npA2v9B2efpStXSip9J4vLqBLJSCfFibB8ICt9oUToICrBAStD0G3mjmoW',
);

console.log('puml encoding tests passed');
