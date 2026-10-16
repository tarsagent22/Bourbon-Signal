import React from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import Bottle from '../../app/(app)/bottle/[id]';
import BottleCheck from '../../app/(app)/bottle-check';
import Signal from '../../app/(app)/signal/[id]';
const screen = new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')!).render(<View style={{ height: '100%', backgroundColor: '#0B0A09' }}><View style={{ height: 54, justifyContent: 'center', paddingHorizontal: 22, borderBottomWidth: 1, borderColor: '#211C17' }}><Text style={{ color: '#F3ECE2', fontSize: 16, fontWeight: '600' }}>{screen === 'check' ? 'Bottle Check' : 'Bottle Profile'}</Text></View>{screen === 'check' ? <BottleCheck /> : screen === 'report' ? <Signal /> : <Bottle />}</View>);
