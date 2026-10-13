import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./tests/browser',
 fullyParallel:true,
 timeout:20000,
 use:{baseURL:'http://127.0.0.1:4175',trace:'retain-on-failure',
  launchOptions:{executablePath:process.env.CHROME_PATH}},
 projects:[320,390,768,1440].map(width=>({name:`chromium-${width}`,use:{viewport:{width,height:900}}})),
 webServer:{command:'npx vite --host 127.0.0.1 --port 4175 --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:false},
});
