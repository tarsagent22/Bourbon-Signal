import React from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import Radar from '../../app/(app)/(tabs)/radar';
createRoot(document.getElementById('root')).render(<View style={{height:'100%', maxWidth:430, width:'100%', alignSelf:'center', backgroundColor:'#090806'}}><Text style={{color:'#d49a48',fontSize:11,textAlign:'center',padding:8}}>LOCAL PREVIEW · SYNTHETIC DATA</Text><Text style={{color:'#f5eee5',textAlign:'center',fontWeight:'700',fontSize:20,padding:14}}>Radar</Text><Radar /><View style={{padding:18,backgroundColor:'#191510'}}><Text style={{color:'#d49a48',textAlign:'center'}}>Home       Radar       Post       My Shelf       Account</Text></View></View>);
