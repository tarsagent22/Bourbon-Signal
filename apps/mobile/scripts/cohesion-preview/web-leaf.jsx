import React from 'react';
export default function Leaf(props){return props.href?<a href={props.href}>{props.children}</a>:<p>Existing review panel</p>;}
