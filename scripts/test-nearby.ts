import assert from 'node:assert/strict';
import test from 'node:test';
import { miles, validPoint } from '../shared/nearby';
test('distances remain accurate across hemispheres and the date line',()=>{assert.equal(miles({latitude:0,longitude:0},{latitude:0,longitude:0}),0);assert.ok(Math.abs(miles({latitude:40.7128,longitude:-74.006},{latitude:34.0522,longitude:-118.2437})-2445.6)<2);assert.ok(miles({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<14);});
test('invalid and out of range coordinates cannot become map pins',()=>{for(const p of [{latitude:NaN,longitude:0},{latitude:91,longitude:0},{latitude:0,longitude:181}])assert.equal(validPoint(p),false);assert.equal(validPoint({latitude:0,longitude:0}),true);});
