// require('dotenv').config({path: './.env'});

import dotenv from "dotenv";
import connectDB from "./db/index.js";
import express from "./app.js";

dotenv.config({ path: "./.env" });

const app = express();

connectDB()
.then( () =>{
    app.listen(process.env.PORT || 8000, () =>{
        console.log(`Server is running at port : ${process.env.PORT}`)
    });
})
.catch((err)=>{
    console.log("MongoDB connection failed !!!", err);
})





















// import express from "express";
// const app = express();

// ( async () => {
//     try {
//         await mongoose.connect(`${process.env.MONGO_URI}/${DB_NAME}`);
//         app.on("error", (error) => {
//             console.log("Error connecting to MongoDB:", error);
//             throw error;
//         });
//         app.listen(process.env.PORT, () => {
//             console.log(`Server is running on port ${process.env.PORT}`);
//         });
//     } catch (error) {
//         console.error("Error connecting to MongoDB:", error);
//         throw error;
//     }
// })()

