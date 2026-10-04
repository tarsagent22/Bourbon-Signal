import React from 'react';
import {useWindowDimensions as actualDimensions} from 'react-native-web';
export * from 'react-native-web';
export const Responsive=React.createContext({width:390,fontScale:1});
export function useWindowDimensions(){return {...actualDimensions(),...React.useContext(Responsive)};}
export const Alert={alert(title,message,buttons){
  const panel=document.createElement('div'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',title);
  Object.assign(panel.style,{position:'fixed',inset:'25% 10% auto',padding:'24px',background:'#211c17',color:'#f3ece2',border:'1px solid #d69a4a',zIndex:10000,fontFamily:'system-ui'});
  const heading=document.createElement('h2');heading.textContent=title;panel.append(heading);
  const copy=document.createElement('p');copy.textContent=message;panel.append(copy);
  for(const option of buttons||[{text:'OK'}]){const button=document.createElement('button');button.textContent=option.text;button.onclick=()=>{panel.remove();option.onPress?.();};panel.append(button);}
  document.body.append(panel);
}};
