Here's a simple workflow for updating your Vite app within Gatsby:

1. Build your Vite app:
```bash
cd vite-app
npm run build
```

2. Copy the built files to Gatsby's static directory:
```bash
cp -r dist/* ../gatsby-site/static/unknown-pleasures/
```

3. Make sure `gatsby-node.js` has this configuration (you only need to set this up once):
```javascript
const express = require('express');
const path = require('path');

exports.onCreateDevServer = ({ app }) => {
  app.use(
    '/unknown-pleasures',
    express.static(path.resolve('static/unknown-pleasures'))
  );
};
```

4. Run Gatsby development server:
```bash
cd ../gatsby-site
gatsby develop
```

The Vite app will be available at `/unknown-pleasures/index.html` during development and production.

Remember: Every time you make changes to your Vite app, you'll just need to repeat steps 1 and 2 to update it in Gatsby. You don't need to touch the `gatsby-node.js` configuration again unless you change the path.