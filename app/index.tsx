import React from 'react';
import { Redirect } from 'expo-router';

// Redirect the web root to the chat tab. This ensures visiting '/' opens Chat.
export default function IndexRedirect() {
  return <Redirect href="/chat" />;
}
