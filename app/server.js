const express = require("express");
const fileUpload = require("express-fileupload");
const request = require("request");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const axios = require('axios');
const archiver = require('archiver');

require("dotenv").config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

let Entity = require("./entity.model");

const uri = process.env.ATLAS_URI;
mongoose.connect(uri, { useNewUrlParser: true });

const connection = mongoose.connection;
connection.once("open", () => {
  console.log("Successfully connected to MongoDB");
});

// upload
app.post("/upload", (req, res) => {
  // date time for record keeping
  var today = new Date();
  var date = today.toISOString().split("T")[0];

  // empty upload
  if (req.files === null) {
    return res.status(400).json({ msg: "No file selected" });
  }

  const file = req.files.file;

  // check extension of file
  if (path.extname(file.name) != ".xlsx") {
    return res
      .status(400)
      .json({ msg: "File upload fail, please upload only .xlsx files" });
  }

  // check if file exists
  if (
    fs.existsSync(`${__dirname}/client/public/uploads/${date}_${file.name}`)
  ) {
    return res.status(400).json({
      msg: "File exists, please process the file or change the file name",
    });
  }

  // all uploaded excel will be uploaded to uploads folder
  file.mv(`${__dirname}/client/public/uploads/${date}_${file.name}`, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err);
    }

    res.json({ fileName: file.name, filePath: `/uploads/${file.name}` });
  });
});

// delete
app.post("/delete", (req, res) => {
  const uploadFolder = `${__dirname}/client/public/uploads/`;
  fs.readdir(uploadFolder, (err, files) => {
    files.forEach((file) => {
      if (file === req.body.file) {
        fs.unlinkSync(`${uploadFolder}${file}`);
      }
    });
    if (err) {
      console.log(err);
    }
  });
});

app.post("/deleteDownload", (req, res) => {
  const downloadFolder = `${__dirname}/client/public/downloads/`;
  fs.readdir(downloadFolder, (err, files) => {
    files.forEach((file) => {
      if (file === req.body.file) {
        fs.unlinkSync(`${downloadFolder}${file}`);
      }
    });
    if (err) {
      console.log(err);
    }
  });
});

// use ner model
app.get("/ner", function (req, res) {
  axios.get("http://127.0.0.1:5000/api/ner")
    .then((response) => {
      // check if there is a response first
      if (response.data.data == "no files to process") {
        res.send(response.data.data);
      } else {
        // for loop, loop through response.data.data, for each specification, find in mongodb and update if exist if not make new
        for (let i = 0; i < response.data.data.length; ++i) {
          // check if cat exists
          Entity.exists({"category":response.data.data[i].category})
            .then(result => {
              if (result != null) {
                // exists, so update the array in db
                const filter = {"category":response.data.data[i].category}
                const update = {"textIdentified":response.data.data[i].data}
                Entity.findOneAndUpdate(filter, update)//.then(result => {console.log(result)})
              } else {
                // does not exists, create new document and save 
                const newEntity = new Entity ({
                  category: response.data.data[i].category,
                  textIdentified: response.data.data[i].data
                })
                newEntity.save()
              }
            })
            .catch(error => {console.log(error)})
        }
        // delete all files that has been processed
        const uploadFolder = `${__dirname}/client/public/uploads/`;
        fs.readdir(uploadFolder, (err, files) => {
          files.forEach((file) => {
            fs.unlinkSync(`${uploadFolder}${file}`);
          });
          if (err) {
            console.log(err);
          }
        });

        // send some data back to react, could be to display progress or the performance
        res.send("data processed successfully");
      }
    })
    .catch(error => {
      console.log(error)
    })
});

// get preprocessed files
app.get("/preprocessedfiles", function (req, res) {
  const uploadFolder = `${__dirname}/client/public/uploads/`;
  var arrayOfFiles = [];
  fs.readdir(uploadFolder, (err, files) => {
    files.forEach((file) => {
      arrayOfFiles.push({ fileName: file });
    });
    if (err) {
      console.log(err);
    }
    res.send(arrayOfFiles);
  });
});

app.get("/checkDownload", function (req,res) {
  const downloadFolder = `${__dirname}/client/public/downloads/`;
  var arrayOfFiles = [];
  fs.readdir(downloadFolder, (err, files) => {
    files.forEach((file) => {
      arrayOfFiles.push({ fileName: file });
    });
    if (err) {
      console.log(err);
    }
    // need to move it to archive after downloading to keep folder empty

    res.send(arrayOfFiles);
  });
})

// download actual files
app.get("/download", function (req, res) {
  const downloadFolder = `${__dirname}/client/public/downloads/`;
  // may want to do some dynamic naming of the zip file here
  const toBeDownloaded = `${__dirname}/client/public/archive/target.zip`;
  const output = fs.createWriteStream(toBeDownloaded);
  const archive = archiver('zip');

  // zip entire download directory
  output.on('close', () => {
    // delete all files in downloads
    fs.readdir(downloadFolder, (err, files) => {
      files.forEach((file) => {
        fs.unlinkSync(`${downloadFolder}${file}`);
      });
      if (err) {
        console.log(err);
      }
    });
    console.log(archive.pointer() + ' total bytes');
    res.download(toBeDownloaded);
  });
  
  archive.on('error', (err) => {
    res.status(400).send('Error while downloading file. Try again later.');
  });

  archive.pipe(output);
  archive.directory(downloadFolder, false);
  archive.finalize();
})

// post identified txt to db
//const entityRouter = require("./routes/entity");
//app.use('/entity', entityRouter);

app.listen(port, () => console.log(`Server running on port: ${port}`));
