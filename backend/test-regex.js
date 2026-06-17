const html = '<img src="/uploads/1718590000000-12345.png">'; 
const regex = /<img[^>]+src="(\/uploads\/[^"]+)"[^>]*>/g; 
console.log(regex.exec(html));
