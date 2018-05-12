var mongoose = require('mongoose');
var Schema = mongoose.Schema;
mongoose.Promise = global.Promise;

var schema = new Schema({
  createdAt:{type:Date,required:true},
    _userId: { type: String, required: true, ref: 'User' },
    token: { type: String, required: true },
   
}, {
  
  collection: 'passwordresettokens'
});

module.exports = mongoose.model('passwordresettokens', schema);