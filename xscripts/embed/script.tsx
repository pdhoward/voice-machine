"use client";

import Script from 'next/script';

  const widgetBaseUrl =
    process.env.NODE_ENV === 'production'
      ? 'https://voice.strategicmachines.ai'
      : 'https://chaotic.ngrok.io';

// example nextjs script and html script

export default function Home() {
  return (
    <>     
        <Script
        src={`${widgetBaseUrl}/voice-widget.js`}
        strategy="afterInteractive"
        data-tenant-widget-key="w_cypress_main_7f1b0e9c64f54d1a"
        data-agent-id="conciergev2"
        />

        <script
        src="https://yourdomain.com/voice-widget.js"
        data-tenant-widget-key="w_cypress_main_7f1b0e9c64f54d1a"
        data-agent-id="conciergev2"
        ></script>
    </>  
)}

