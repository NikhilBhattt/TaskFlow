import { createServer } from "http"
import app from "./index.js"
import config from "./config/config.js"

const server = createServer(app);

server.listen(3000, ()=>console.log(`Server listening on PORT ${config.PORT}`))