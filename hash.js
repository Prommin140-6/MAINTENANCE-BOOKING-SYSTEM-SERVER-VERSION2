const bcrypt = require('bcryptjs');

   const password = '1234'; // รหัสผ่านที่ต้องการใช้
   bcrypt.hash(password, 10, (err, hash) => {
     if (err) throw err;
     console.log(hash);
   });