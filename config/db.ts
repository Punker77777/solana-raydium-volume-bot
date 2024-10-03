import mongoose from 'mongoose'

export const connectMongoDB = function () {
  var isConnected = false;
  let MONGO_URL = `mongodb+srv://coinmajesty:s1mYcfhyDMjBiYle@cluster0.vgdwm1l.mongodb.net/xbot`
  var connect = function () {
    try {
      if (MONGO_URL) {
        // @ts-ignore
        mongoose.connect(MONGO_URL).then(function (connection) {
          console.log('MONGODB CONNECTED');
          // console.log('MONGODB CONNECTED : ' + connection.connection.host);
          isConnected = true;
          // @ts-ignore
        }).catch(function (error) {
          // console.log('Error : ' + error.message);
          isConnected = false;
          // Attempt to reconnect
          setTimeout(connect, 1000); // Retry connection after 1 second
        });
      } else {
        console.log('No Mongo URL');
      }
    } catch (error) {
      // console.log('Error : ' + error.message);
      isConnected = false;
      // Attempt to reconnect
      setTimeout(connect, 1000); // Retry connection after 1 second
    }
  };

  connect();

  mongoose.connection.on('disconnected', function () {
    console.log('MONGODB DISCONNECTED');
    isConnected = false;
    // Attempt to reconnect
    setTimeout(connect, 1000); // Retry connection after 1 second
  });

  mongoose.connection.on('reconnected', function () {
    console.log('MONGODB RECONNECTED');
    isConnected = true;
  });
};
