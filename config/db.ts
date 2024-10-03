import mongoose from 'mongoose'
import { MONGO_URL } from '../constants';

export const connectMongoDB = function () {
  var isConnected = false;
  let url = MONGO_URL
  var connect = function () {
    try {
      if (url) {
        // @ts-ignore
        mongoose.connect(url).then(function (connection) {
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
