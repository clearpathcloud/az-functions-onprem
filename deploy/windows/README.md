# Windows Installation Instructions

1. Place these files in a folder for execution
2. Ensure a current Node.js release is installed on the server. 
3. Run `npm install`. This will download dependencies.
4. Ensure a file called `local.settings.json` exists and contains at least `{"$schema": "./local.settings.schema.json"}`.  You can use VS Code (a relatively small text editor) to autocomplete and verify the file. Ensure this file is correctly set up before continuing.
5. Run `npm run windows-install` to install the windows service. 
6. Configure the service in `services.msc`, setting the user. 
7. Inspect `eventvwr.exe` Application Log, where you'll see events logged from the service. You may need to restart the service if changes are made.

Ensure that files are secured, and consider using better secrets management. This template is meant as a starting point / POC for a project. As this tool grows, consider adding a build step, expanding the utils, and adding more security measures. Be careful to use a least privileges approach always when working on integrations.
