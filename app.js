var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var path = require('path');
var User = require('./models/user');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const methodOverride = require('method-override');


app.set('view engine', 'ejs');
app.use(methodOverride('_method'));

var mongoURIlogin = 'mongodb://matte:francY2008@ds161653.mlab.com:61653/login';
const mongoURIuploads = 'mongodb://matte:francY2008@ds255463.mlab.com:55463/bunjeeuploads';

//connect to MongoDB
//mongoose.connect('mongodb://matte:francY2008@ds161653.mlab.com:61653/login');
//var db = mongoose.connection;

// Init gfs
let gfs;

// Create storage engine
const storage = new GridFsStorage({
  url: mongoURIuploads,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        User.findById(req.session.userId).exec(function (error, user) {
            if (error) {
              return next(error);
            } else {
              if (user === null) {
                return res.redirect('/logreg');
              } else {
                const filename = buf.toString('hex') + path.extname(file.originalname);
                const fileInfo = {
                  filename: filename,
                  aliases: user.username,
                  bucketName: 'uploads'
                };
                resolve(fileInfo);
              }
            }
          });
      });
    });
  }
});

const upload = multer({ storage });


var promise = mongoose.connect(mongoURIlogin, {
  useMongoClient: true,
  socketTimeoutMS: 0,
  keepAlive: true,
  reconnectTries: 30
});

promise.then(function(db) {
	db.on('error', console.error.bind(console, 'connection error:'));
	db.once('open', function () {
	// we're connected!
	});
});

const conn = mongoose.createConnection(mongoURIuploads);

conn.once('open', () => {
  // Init stream
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
});

//handle mongo error
//db.on('error', console.error.bind(console, 'connection error:'));
//db.once('open', function () {
  // we're connected!
//});

//use sessions for tracking logins
//saveUninitialized: true to keep the users logged also if the browser is closed, otherwise the session is destroyed
//when the browser is closed
app.use(session({
  secret: 'imabunjer',
  resave: true,
  saveUninitialized: true,
  cookie: {maxAge: 1000 * 60 * 10},
  store: new MongoStore({
	//mongooseConnection: db
    mongooseConnection: promise
  })
}));

app.use(function(req, res, next) {
  req.session._garbage = Date();
  req.session.touch();
  next();
});

// parse incoming requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', function (req, res, next) {
  gfs.files.find().toArray((err, files) => {
    // Check if files
    if (!files || files.length === 0) {
      res.render('home', { files: false });
    } else {
      files.map(file => {
        if (
          file.contentType === 'video/mp4' ||
          file.contentType === 'video/mov' ||
          file.contentType === 'video/quicktime' ||
          file.contentType === 'video/altro'
        ) {
          file.isVideo = true;
        } else {
          file.isVideo = false;
        }
      });
      res.render('home', { files: files });
    }
  });
});

var logreg = require('./routes/logreg');
app.use('/logreg', logreg);

app.get('/profile', function (req, res, next) {
  User.findById(req.session.userId).exec(function (error, user) {
      if (error) {
        return next(error);
      } else {
        if (user === null) {
          return res.redirect('/logreg');
        } else {
          //return res.send('<h1>Name: </h1>' + user.username + '<h2>Mail: </h2>' + user.email + '<br><a type="button" href="/logout">Logout</a>')
          //return res.render('index', { nickname: user.username });
          gfs.files.find().toArray((err, files) => {
            // Check if files
            if (!files || files.length === 0) {
              res.render('profile', { files: false , nickname : user.username});
            } else {
              files.map(file => {
                if
                  (file.contentType === 'video/mp4' ||
                  file.contentType === 'video/mov' ||
                  file.contentType === 'video/quicktime' ||
                  file.contentType === 'video/altro')
                {
                  file.isVideo = true;
                } else {
                  file.isVideo = false;
                }
                file.isUser = (file.aliases == user.username) ? true : false;
              });
              res.render('profile', { files: files , nickname : user.username});
            }
          });
        }
      }
    });
});

// serve static files from template
app.use(express.static(__dirname + '/templateLogReg'));


// @route POST /upload
// @desc  Uploads file to DB
app.post('/upload', upload.single('file'), (req, res) => {
  // res.json({ file: req.file });
  res.redirect('/profile');
});

// @route GET /files
// @desc  Display all files in JSON
app.get('/files', (req, res) => {
  gfs.files.find().toArray((err, files) => {
    // Check if files
    if (!files || files.length === 0) {
      return res.status(404).json({
        err: 'No files exist'
      });
    }

    // Files exist
    return res.json(files);
  });
});

// @route GET /files/:filename
// @desc  Display single file object
app.get('/files/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }
    // File exists
    return res.json(file);
  });
});

// @route GET /image/:filename
// @desc Display video
app.get('/video/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    // Check if video
    if (file.contentType === 'video/mp4' ||
        file.contentType === 'video/mov' ||
        file.contentType === 'video/quicktime' ||
        file.contentType === 'video/altro') {
      // Read output to browser
      const readstream = gfs.createReadStream(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({
        err: 'Not a video'
      });
    }
  });
});

// @route DELETE /files/:id
// @desc  Delete file
app.delete('/files/:id', (req, res) => {
  gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
    if (err) {
      return res.status(404).json({ err: err });
    }
    res.redirect('/profile');
  });
});

// GET for logout logout
app.get('/logout', function (req, res, next) {
  if (req.session) {
    // delete session object
    req.session.destroy(function (err) {
      if (err) {
        return next(err);
      } else {
        return res.redirect('/');
      }
    });
  }
});



// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('File Not Found');
  err.status = 404;
  next(err);
});

// error handler
// define as the last app.use callback
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.send(err.message);
});



// listen on port 3000
app.listen(3000, function () {
  console.log('Express app listening on port 3000');
});
