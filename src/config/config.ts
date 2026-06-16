import { configDotenv } from "dotenv"
configDotenv();

const config = {
    PORT: process.env.PORT || 5000
}

export default config