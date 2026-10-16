import React, {useState} from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import Bottle from '../../app/(app)/bottle/[id]';
import BottleCheck from '../../app/(app)/bottle-check';
import {CollectionStatisticsSheet} from '../../src/components/CollectionStatisticsSheet';
import {stats,statsBottles,statsValue} from './fixture';
import Signal from '../../app/(app)/signal/[id]';
function StatsScene(){ const [visible,setVisible]=useState(true);return <><Text>LOCAL PREVIEW · SYNTHETIC DATA</Text><CollectionStatisticsSheet visible={visible} statistics={stats} bottles={statsBottles} collectionVersion={1} collectionValue={statsValue} advancedAccess onClose={()=>setVisible(false)} onDismiss={()=>{}}/>{!visible?<Text>Stats closed</Text>:null}</>;}
const screen = new URLSearchParams(location.search).get('screen');
createRoot(document.getElementById('root')!).render(<View style={{ height: '100%', backgroundColor: '#0B0A09' }}><View style={{ height: 54, justifyContent: 'center', paddingHorizontal: 22, borderBottomWidth: 1, borderColor: '#211C17' }}><Text style={{ color: '#F3ECE2', fontSize: 16, fontWeight: '600' }}>{screen === 'check' ? 'Bottle Check' : 'Bottle Profile'}</Text></View>{screen === 'stats' ? <StatsScene/> : screen === 'check' ? <BottleCheck /> : screen === 'report' ? <Signal /> : <Bottle />}</View>);
