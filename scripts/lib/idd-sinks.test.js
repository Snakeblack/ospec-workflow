"use strict";

// E1.50 content-security-signal: the corpus of security sinks by stack. Each
// sink is found in the languages where its API exists; a safe form, a comment
// or another language finds nothing (openspec/specs/idd/spec.md, REQ-idd-012).

const test = require("node:test");
const assert = require("node:assert");

const { LANGUAGES, WEAKNESSES, isCommentOnly, sinkOf } = require("./idd-sinks.js");

// [file, added line, expected sink]
const SINKS = [
  // Go
  ["srv/client.go", "tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}", "disabled TLS verification (CWE-295)"],
  ["srv/run.go", 'cmd := exec.Command("sh", "-c", userCmd)', "composed shell command (CWE-78)"],
  ["srv/repo.go", 'q := fmt.Sprintf("SELECT * FROM users WHERE name = \'%s\'", name)', "composed SQL (CWE-89)"],
  ["srv/repo.go", 'rows, err := db.Query("SELECT id FROM orders WHERE owner = " + owner)', "composed SQL (CWE-89)"],
  ["srv/token.go", "token, _, err := parser.ParseUnverified(raw, claims)", "unverified JWT (CWE-347)"],
  ["srv/files.go", "os.WriteFile(path, data, 0666)", "world-writable mode (CWE-732)"],
  // JavaScript and TypeScript
  ["src/calc.js", "const total = eval(formula);", "code evaluation (CWE-94)"],
  ["src/calc.mjs", "const fn = new Function('a', body);", "code evaluation (CWE-94)"],
  ["src/sandbox.cjs", "vm.runInNewContext(code, ctx);", "code evaluation (CWE-94)"],
  ["src/run.ts", "execSync(`git log ${branch}`);", "composed shell command (CWE-78)"],
  ["src/run.js", 'child_process.exec(command, done);', "composed shell command (CWE-78)"],
  ["src/run.js", 'exec("convert " + input + " out.png");', "composed shell command (CWE-78)"],
  ["src/run.js", "require('node:child_process').execSync(`sh ${script}`);", "composed shell command (CWE-78)"],
  ["src/db.ts", "await db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);", "composed SQL (CWE-89)"],
  ["src/db.js", 'pool.query("DELETE FROM sessions WHERE token = \'" + token + "\'");', "composed SQL (CWE-89)"],
  ["src/http.js", "const agent = new https.Agent({ rejectUnauthorized: false });", "disabled TLS verification (CWE-295)"],
  ["src/auth.js", "const digest = crypto.createHash('md5').update(password).digest('hex');", "weak credential hash (CWE-327)"],
  ["src/app.tsx", "app.use(session({ csrf: false }));", "disabled CSRF protection (CWE-352)"],
  // Python
  ["app/load.py", "data = pickle.loads(blob)", "unsafe deserialization (CWE-502)"],
  ["app/conf.py", "cfg = yaml.load(stream)", "unsafe YAML load (CWE-502)"],
  ["app/run.py", 'subprocess.run(cmd, shell=True)', "composed shell command (CWE-78)"],
  ["app/run.py", 'os.system("tar xf " + archive)', "composed shell command (CWE-78)"],
  ["app/repo.py", 'cur.execute(f"SELECT * FROM users WHERE name = \'{name}\'")', "composed SQL (CWE-89)"],
  ["app/repo.py", 'cur.execute("SELECT * FROM users WHERE id = %s" % user_id)', "composed SQL (CWE-89)"],
  ["app/fetch.py", 'requests.get("https://api.example.com/v1", verify=False)', "disabled TLS verification (CWE-295)"],
  ["app/token.py", 'claims = jwt.decode(raw, options={"verify_signature": False})', "unverified JWT (CWE-347)"],
  ["app/views.py", "@csrf_exempt", "disabled CSRF protection (CWE-352)"],
  ["app/xml.py", "parser = etree.XMLParser(resolve_entities=True)", "XML external entities (CWE-611)"],
  // Java and Kotlin
  ["src/main/java/Load.java", "ObjectInputStream in = new ObjectInputStream(socket.getInputStream());", "unsafe deserialization (CWE-502)"],
  ["src/main/java/Security.java", "http.csrf().disable();", "disabled CSRF protection (CWE-352)"],
  ["src/main/kotlin/Repo.kt", 'val q = "SELECT * FROM users WHERE id = " + id', "composed SQL (CWE-89)"],
  ["src/main/java/Xml.java", "factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, true);", "XML external entities (CWE-611)"],
  // C#
  ["Api/Load.cs", "var formatter = new BinaryFormatter();", "unsafe deserialization (CWE-502)"],
  ["Api/Http.cs", "ServicePointManager.ServerCertificateValidationCallback = (s, c, ch, e) => true;", "disabled TLS verification (CWE-295)"],
  ["Api/Repo.cs", 'var sql = $"SELECT * FROM Users WHERE Name = \'{name}\'";', "composed SQL (CWE-89)"],
  ["Api/Xml.cs", "settings.DtdProcessing = DtdProcessing.Parse;", "XML external entities (CWE-611)"],
  // Ruby
  ["app/models/user.rb", 'User.find_by_sql("SELECT * FROM users WHERE name = \'#{name}\'")', "composed SQL (CWE-89)"],
  ["app/jobs/run.rb", "`convert #{path} out.png`", "composed shell command (CWE-78)"],
  ["app/load.rb", "obj = Marshal.load(data)", "unsafe deserialization (CWE-502)"],
  ["app/controllers/hooks_controller.rb", "skip_before_action :verify_authenticity_token", "disabled CSRF protection (CWE-352)"],
  // PHP
  ["web/run.php", "system($cmd);", "composed shell command (CWE-78)"],
  ["web/load.php", "$obj = unserialize($_COOKIE['cart']);", "unsafe deserialization (CWE-502)"],
  ["web/repo.php", '$q = "SELECT * FROM users WHERE id = " . $id;', "composed SQL (CWE-89)"],
  ["web/repo.php", '$q = "SELECT * FROM users WHERE id = $id";', "composed SQL (CWE-89)"],
  // Rust and shell
  ["src/client.rs", "let client = Client::builder().danger_accept_invalid_certs(true).build()?;", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl -k https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/setup.sh", "chmod -R 777 /srv/data", "world-writable mode (CWE-732)"],
];

// [file, added line]: safe forms, mentions and other languages.
const SAFE = [
  ["src/calc.js", "const value = JSON.parse(text);"],
  ["src/calc.js", "const evaluate = (x) => x * 2;"],
  ["src/calc.py", "value = ast.literal_eval(text)"],
  ["src/match.js", "const found = pattern.exec(input + suffix);"],
  ["src/match.js", "const found = new RegExp(source).exec(input + suffix);"],
  ["src/run.js", "execFileSync('git', ['log', branch]);"],
  ["src/run.js", "spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });"],
  ["src/run.js", 'exec("git status");'],
  ["src/db.js", "await db.query('SELECT * FROM users WHERE id = $1', [id]);"],
  ["src/db.js", "const rows = await sql`SELECT * FROM users WHERE id = ${id}`;"],
  ["src/db.js", 'const q = "SELECT name FROM users".trim();'],
  ["src/ui.js", 'const label = "Select a file from the list: " + name;'],
  ["app/repo.py", 'cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))'],
  ["app/conf.py", "cfg = yaml.load(stream, Loader=yaml.SafeLoader)"],
  ["app/conf.py", "cfg = yaml.safe_load(stream)"],
  ["app/run.py", 'subprocess.run(["tar", "xf", archive])'],
  ["app/fetch.py", 'requests.get("https://api.example.com/v1", timeout=5)'],
  ["src/hash.js", "const sum = crypto.createHash('sha256').update(file).digest('hex');"],
  ["src/hash.go", "sum := md5.Sum(fileBytes)"],
  // A sink of one language in a file of another.
  ["src/calc.go", "result := eval(expression)"],
  ["src/load.js", "const data = pickle.loads(blob);"],
  ["styles/site.css", "content: 'eval(x)';"],
  ["README.txt", "Never call eval(input) on user data."],
];

// [file, added line]: a line only a comment in the language of its file.
const COMMENTS = [
  ["src/calc.js", "// eval(formula) would be shorter"],
  ["src/calc.ts", "/* rejectUnauthorized: false */"],
  ["src/calc.ts", " * new Function(body) is banned here"],
  ["app/load.py", "# data = pickle.loads(blob)"],
  ["scripts/fetch.sh", "# curl -k https://internal/api"],
  ["srv/client.go", "// InsecureSkipVerify: true is never allowed"],
  ["app/load.rb", "# obj = Marshal.load(data)"],
];

// [file, added line, expected sink]: one line per form E1.50 already found that
// SINKS leaves out, so a rewrite of a rule cannot drop it unnoticed.
const KNOWN = [
  ["src/http.js", "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';", "disabled TLS verification (CWE-295)"],
  ["app/tls.py", "ctx.verify_mode = ssl.CERT_NONE", "disabled TLS verification (CWE-295)"],
  ["app/tls.py", "ctx.check_hostname = False", "disabled TLS verification (CWE-295)"],
  ["lib/http.rb", "http.verify_mode = OpenSSL::SSL::VERIFY_NONE", "disabled TLS verification (CWE-295)"],
  ["web/http.php", "$opts = [CURLOPT_SSL_VERIFYPEER => false];", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl --insecure https://internal/api", "disabled TLS verification (CWE-295)"],
  ["src/main/java/Trust.java", "public void checkServerTrusted(X509Certificate[] chain, String type) {}", "disabled TLS verification (CWE-295)"],
  ["src/main/java/Trust.java", "HostnameVerifier verifier = (host, session) -> true;", "disabled TLS verification (CWE-295)"],
  ["app/load.py", "code = marshal.loads(blob)", "unsafe deserialization (CWE-502)"],
  ["Api/Json.cs", "settings.TypeNameHandling = TypeNameHandling.All;", "unsafe deserialization (CWE-502)"],
  ["app/load.rb", "conf = YAML.load(text)", "unsafe deserialization (CWE-502)"],
  ["src/load.js", "const obj = serialize.unserialize(cookie);", "unsafe deserialization (CWE-502)"],
  ["app/calc.py", "total = eval(formula)", "code evaluation (CWE-94)"],
  ["web/calc.php", "$total = eval($formula);", "code evaluation (CWE-94)"],
  ["app/calc.rb", "total = eval(formula)", "code evaluation (CWE-94)"],
  ["web/calc.php", "$fn = create_function('$a', $body);", "code evaluation (CWE-94)"],
  ["app/meta.rb", 'obj.instance_eval("@#{name}")', "code evaluation (CWE-94)"],
  ["app/meta.rb", 'klass.class_eval("def #{name}; end")', "code evaluation (CWE-94)"],
  ["web/run.php", "$out = `ls $dir`;", "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", "out = %x(ls #{dir})", "composed shell command (CWE-78)"],
  ["src/run.js", "spawn('sh', ['-c', 'tar xf ' + archive]); execa('bash', '-c', cmd);", "composed shell command (CWE-78)"],
  ["app/run.py", 'subprocess.run(["bash", "-c", cmd])', "composed shell command (CWE-78)"],
  ["app/auth.py", "digest = hashlib.md5(password).hexdigest()", "weak credential hash (CWE-327)"],
  ["web/auth.php", "$digest = sha1($password);", "weak credential hash (CWE-327)"],
  ["src/main/java/Auth.java", 'byte[] d = MessageDigest.getInstance("MD5").digest(password.getBytes());', "weak credential hash (CWE-327)"],
  ["srv/cors.go", 'w.Header().Set("Access-Control-Allow-Origin", "*"); w.Header().Set("Access-Control-Allow-Credentials", "true")', "credentialed wildcard CORS (CWE-942)"],
  ["app/files.py", "os.umask(0)", "world-writable mode (CWE-732)"],
  ["app/files.py", "os.chmod(path, 0o777)", "world-writable mode (CWE-732)"],
  ["scripts/setup.sh", "chmod o+w /srv/shared", "world-writable mode (CWE-732)"],
  // The generic verify=False of Python names TLS first, as it always did.
  ["app/token.py", "claims = jwt.decode(raw, key, verify=False)", "disabled TLS verification (CWE-295)"],
  ["app/token.py", 'claims = jwt.decode(raw, key, algorithms=["none"])', "unverified JWT (CWE-347)"],
  ["src/main/java/Token.java", "Jwt jwt = parser.parseUnsecuredClaims(raw);", "unverified JWT (CWE-347)"],
  ["app/settings.py", "WTF_CSRF_ENABLED = False", "disabled CSRF protection (CWE-352)"],
  ["app/server.rb", "set :protection, :csrf => false", "disabled CSRF protection (CWE-352)"],
  ["Api/Controllers/Hooks.cs", "[IgnoreAntiforgeryToken]", "disabled CSRF protection (CWE-352)"],
  ["src/main/java/Xml.java", "factory.setExpandEntityReferences(true);", "XML external entities (CWE-611)"],
  ["web/xml.php", "$doc->loadXML($xml, LIBXML_NOENT);", "XML external entities (CWE-611)"],
];

// [file, added line, expected sink]: forms of the same weaknesses that E1.100
// adds, and the SSH host key check.
const ADDED = [
  ["srv/client.go", "cfg.InsecureSkipVerify = true", "disabled TLS verification (CWE-295)"],
  ["app/tls.py", "ctx = ssl._create_unverified_context()", "disabled TLS verification (CWE-295)"],
  ["src/client.rs", "let b = builder.danger_accept_invalid_hostnames(true);", "disabled TLS verification (CWE-295)"],
  ["web/http.php", "curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);", "disabled TLS verification (CWE-295)"],
  ["web/http.php", "curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);", "disabled TLS verification (CWE-295)"],
  ["web/http.php", "$ctx = stream_context_create(['ssl' => ['verify_peer' => false]]);", "disabled TLS verification (CWE-295)"],
  ["Api/Http.cs", "handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;", "disabled TLS verification (CWE-295)"],
  ["Api/Tls.cs", "RemoteCertificateValidationCallback = (s, c, ch, e) => true,", "disabled TLS verification (CWE-295)"],
  ["src/main/java/Http.java", "builder.setSSLHostnameVerifier(NoopHostnameVerifier.INSTANCE);", "disabled TLS verification (CWE-295)"],
  ["src/main/kotlin/Http.kt", "val verifier = HostnameVerifier { _, _ -> true }", "disabled TLS verification (CWE-295)"],
  ["src/main/java/Trust.java", "public void checkServerTrusted(X509Certificate[] chain, String type) throws CertificateException {}", "disabled TLS verification (CWE-295)"],
  ["src/main/java/Trust.java", "public boolean verify(String host, SSLSession session) { return true; }", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl -sSk https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl -kL https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "curl -kfsSL https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "wget --no-check-certificate https://internal/api", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "export NODE_TLS_REJECT_UNAUTHORIZED=0", "disabled TLS verification (CWE-295)"],
  ["scripts/fetch.sh", "git -c http.sslVerify=false clone $url", "disabled TLS verification (CWE-295)"],
  ["srv/ssh.go", "HostKeyCallback: ssh.InsecureIgnoreHostKey(),", "disabled host key verification (CWE-322)"],
  ["app/ssh.py", "client.set_missing_host_key_policy(paramiko.AutoAddPolicy())", "disabled host key verification (CWE-322)"],
  ["src/main/java/Ssh.java", 'session.setConfig("StrictHostKeyChecking", "no");', "disabled host key verification (CWE-322)"],
  ["scripts/deploy.sh", "ssh -o StrictHostKeyChecking=no deploy@host", "disabled host key verification (CWE-322)"],
  ["app/load.py", "obj = dill.loads(blob)", "unsafe deserialization (CWE-502)"],
  ["app/load.py", "obj = jsonpickle.decode(text)", "unsafe deserialization (CWE-502)"],
  ["src/main/java/Load.java", "Object o = new XMLDecoder(input).readObject();", "unsafe deserialization (CWE-502)"],
  ["src/main/java/Json.java", "mapper.enableDefaultTyping();", "unsafe deserialization (CWE-502)"],
  ["Api/Load.cs", "var f = new NetDataContractSerializer();", "unsafe deserialization (CWE-502)"],
  ["app/load.rb", "obj = Marshal.restore(data)", "unsafe deserialization (CWE-502)"],
  ["app/conf.py", "docs = list(yaml.load_all(stream))", "unsafe YAML load (CWE-502)"],
  ["src/sandbox.js", "vm.runInThisContext(code);", "code evaluation (CWE-94)"],
  ["src/sandbox.js", "const result = script.runInNewContext(sandbox);", "code evaluation (CWE-94)"],
  ["app/plugin.py", "exec(code, scope)", "code evaluation (CWE-94)"],
  ["app/meta.rb", 'mod.module_eval("def #{name}; end")', "code evaluation (CWE-94)"],
  ["scripts/run.sh", 'eval "$USER_CMD"', "code evaluation (CWE-94)"],
  ["app/run.py", "out = os.popen('ls ' + path).read()", "composed shell command (CWE-78)"],
  ["app/run.py", "os.system(command)", "composed shell command (CWE-78)"],
  ["app/run.py", 'subprocess.run("tar xf %s" % archive, shell=True)', "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", "out = %x[ls #{dir}]", "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", "out = %x(ps aux | grep #{name})", "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", "out = %x{ls | wc -l #{dir}}", "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", "out = %x|cat #{file}|", "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", 'Kernel.system("rm -rf #{dir}")', "composed shell command (CWE-78)"],
  ["app/run.py", 'out = subprocess.getoutput(f"ls {path}")', "composed shell command (CWE-78)"],
  ["web/run.php", 'exec("convert " . $input . " out.png");', "composed shell command (CWE-78)"],
  ["web/run.php", '$p = popen("tail -f $log", "r");', "composed shell command (CWE-78)"],
  ["app/jobs/run.rb", 'system("convert #{path} out.png")', "composed shell command (CWE-78)"],
  ["src/run.js", "spawn(command, { shell: true });", "composed shell command (CWE-78)"],
  ["src/run.ts", "spawnSync(`git ${args}`, { shell: true });", "composed shell command (CWE-78)"],
  ["src/main/java/Run.java", 'Process p = Runtime.getRuntime().exec("ping " + host);', "composed shell command (CWE-78)"],
  ["Api/Run.cs", 'Process.Start("cmd.exe", "/c " + input);', "composed shell command (CWE-78)"],
  ["src/run.rs", 'let out = Command::new("sh").arg("-c").arg(&script).output()?;', "composed shell command (CWE-78)"],
  ["srv/auth.go", "sum := md5.Sum([]byte(password))", "weak credential hash (CWE-327)"],
  ["src/main/java/Auth.java", "String d = DigestUtils.md5Hex(password);", "weak credential hash (CWE-327)"],
  ["Api/Auth.cs", "var d = MD5.HashData(Encoding.UTF8.GetBytes(password));", "weak credential hash (CWE-327)"],
  ["app/auth.rb", "d = Digest::MD5.hexdigest(password)", "weak credential hash (CWE-327)"],
  ["web/auth.php", "$d = hash('sha1', $password);", "weak credential hash (CWE-327)"],
  ["src/auth.rs", "let d = md5::compute(&password);", "weak credential hash (CWE-327)"],
  ["src/app.ts", "app.use(cors({ origin: '*', credentials: true }));", "credentialed wildcard CORS (CWE-942)"],
  ["src/app.ts", "app.use(cors({ credentials: true, origin: true }));", "credentialed wildcard CORS (CWE-942)"],
  ["app/cors.py", 'headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true"}', "credentialed wildcard CORS (CWE-942)"],
  ["Api/Program.cs", "policy.SetIsOriginAllowed(_ => true).AllowCredentials();", "credentialed wildcard CORS (CWE-942)"],
  ["srv/files.go", "os.MkdirAll(dir, 0777)", "world-writable mode (CWE-732)"],
  ["srv/files.go", "os.Chmod(path, 0o666)", "world-writable mode (CWE-732)"],
  ["src/fs.js", "fs.chmodSync(file, 0o777);", "world-writable mode (CWE-732)"],
  ["src/fs.js", "fs.mkdirSync(dir, { recursive: true, mode: 0o777 });", "world-writable mode (CWE-732)"],
  ["app/files.py", "os.chmod(path, 0o766)", "world-writable mode (CWE-732)"],
  ["Api/Files.cs", "File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.OtherWrite);", "world-writable mode (CWE-732)"],
  ["src/main/java/Files.java", 'Files.setPosixFilePermissions(p, PosixFilePermissions.fromString("rwxrwxrwx"));', "world-writable mode (CWE-732)"],
  ["src/main/java/Files.java", "file.setWritable(true, false);", "world-writable mode (CWE-732)"],
  ["scripts/setup.sh", "chmod 666 /srv/data/log", "world-writable mode (CWE-732)"],
  ["scripts/setup.sh", "chmod -R a+rw /srv/data", "world-writable mode (CWE-732)"],
  ["src/main/java/Token.java", "Jwt jwt = parser.parseClaimsJwt(raw);", "unverified JWT (CWE-347)"],
  ["src/token.js", "jwt.verify(token, key, { algorithms: ['none'] });", "unverified JWT (CWE-347)"],
  ["app/token.rb", "payload = JWT.decode(token, nil, false)", "unverified JWT (CWE-347)"],
  ["src/token.rs", "validation.insecure_disable_signature_validation();", "unverified JWT (CWE-347)"],
  ["Api/Auth.cs", "RequireSignedTokens = false,", "unverified JWT (CWE-347)"],
  ["src/main/java/Security.java", "http.csrf(csrf -> csrf.disable());", "disabled CSRF protection (CWE-352)"],
  ["src/main/java/Security.java", "http.csrf(AbstractHttpConfigurer::disable);", "disabled CSRF protection (CWE-352)"],
  ["src/main/kotlin/Security.kt", "http { csrf { disable() } }", "disabled CSRF protection (CWE-352)"],
  ["Api/Program.cs", 'app.MapPost("/hook", Handle).DisableAntiforgery();', "disabled CSRF protection (CWE-352)"],
  ["app/controllers/hooks_controller.rb", "skip_forgery_protection", "disabled CSRF protection (CWE-352)"],
  ["Api/Controllers/Hooks.cs", "[IgnoreAntiforgeryToken(Order = 1001)]", "disabled CSRF protection (CWE-352)"],
  ["web/config.php", "return ['csrf' => false];", "disabled CSRF protection (CWE-352)"],
  ["src/main/java/Xml.java", 'factory.setFeature("http://xml.org/sax/features/external-general-entities", true);', "XML external entities (CWE-611)"],
  ["src/main/java/Xml.java", 'factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", false);', "XML external entities (CWE-611)"],
  ["web/xml.php", "libxml_disable_entity_loader(false);", "XML external entities (CWE-611)"],
  ["Api/Xml.cs", "settings.XmlResolver = new XmlUrlResolver();", "XML external entities (CWE-611)"],
];

// [file, added line]: safe neighbors of the forms E1.100 adds.
const ADDED_SAFE = [
  ["srv/client.go", "if cfg.InsecureSkipVerify == true {"],
  ["src/http.js", "if (options.rejectUnauthorized === false) warn();"],
  ["web/http.php", "curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);"],
  ["app/ssh.py", "client.set_missing_host_key_policy(paramiko.RejectPolicy())"],
  ["scripts/deploy.sh", "ssh -o StrictHostKeyChecking=yes deploy@host"],
  ["app/conf.py", "docs = list(yaml.load_all(stream, Loader=yaml.SafeLoader))"],
  ["scripts/check.js", "new vm.Script(content, { filename: file });"],
  ["app/db.py", "def exec(self, sql, params):"],
  ["app/db.py", "cursor.exec(sql, params)"],
  ["scripts/env.sh", 'eval "$(ssh-agent -s)"'],
  ["app/run.py", "os.system('make clean')"],
  ["app/run.py", 'subprocess.run("make clean", shell=True)'],
  ["scripts/fetch.sh", "curl -o out.tar https://example.com/a.tar && tar -xkf out.tar"],
  ["scripts/fetch.sh", "wget -k https://example.com/docs/"],
  ["src/run.js", "spawn('npm', ['test'], { shell: true });"],
  ["src/run.js", "spawn(command, args, { stdio: 'inherit' });"],
  ["src/main/java/Run.java", 'Process p = Runtime.getRuntime().exec(new String[] {"git", "status"});'],
  ["srv/auth.go", "sum := sha256.Sum256([]byte(password))"],
  ["src/app.ts", "app.use(cors({ origin: 'https://app.example.com', credentials: true }));"],
  ["src/app.ts", "app.use(cors({ origin: '*' }));"],
  ["srv/files.go", "os.MkdirAll(dir, 0o755)"],
  ["src/fs.js", "fs.mkdirSync(dir, { recursive: true, mode: 0o775 });"],
  ["app/files.py", "os.chmod(path, 0o600)"],
  ["src/docs.js", 'writeFile(root, "docs/decisions/0002-sync.md", text);'],
  ["src/fs.js", "const fd = openSync(path, flags, 0o666);"],
  ["srv/files.go", "f, err := os.OpenFile(name, os.O_CREATE|os.O_WRONLY, 0666)"],
  ["src/fs.js", "fs.chmodSync(copied, info.mode & 0o777);"],
  ["tools/stub.py", "temporary.chmod(path.stat().st_mode & 0o7777)"],
  ["scripts/setup.sh", "chmod 755 bin/run"],
  ["scripts/setup.sh", "chmod go-w /srv/data"],
  ["scripts/setup.sh", "chmod u+x bin/run"],
  ["src/token.js", "jwt.verify(token, key, { algorithms: ['HS256'] });"],
  ["app/token.rb", "payload = JWT.decode(token, key, true, { algorithm: 'HS256' })"],
  ["src/main/java/Security.java", 'http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/**"));'],
  ["Api/Xml.cs", "settings.XmlResolver = null;"],
];

test("the corpus finds each sink in the languages where its API exists", () => {
  for (const [file, line, label] of SINKS) assert.strictEqual(sinkOf(file, line), label, `${file}: ${line}`);
});

test("every form found before E1.100 keeps its label", () => {
  for (const [file, line, label] of KNOWN) assert.strictEqual(sinkOf(file, line), label, `${file}: ${line}`);
});

test("the forms E1.100 adds are found, and their safe neighbors are not", () => {
  for (const [file, line, label] of ADDED) assert.strictEqual(sinkOf(file, line), label, `${file}: ${line}`);
  for (const [file, line] of ADDED_SAFE) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("a database method named exec keeps the composed SQL label it had", () => {
  const sql = "composed SQL (CWE-89)";
  assert.strictEqual(sinkOf("web/repo.php", "$pdo->exec('DELETE FROM t WHERE id = ' . $id);"), sql);
  assert.strictEqual(sinkOf("web/repo.php", `$pdo->exec("DELETE FROM sessions WHERE token = '$token'");`), sql);
  assert.strictEqual(sinkOf("app/repo.rb", 'conn.exec("SELECT * FROM users WHERE id = #{id}")'), sql);
  assert.strictEqual(sinkOf("web/repo.php", "$pdo->exec($sql);"), "composed shell command (CWE-78)", "as before E1.100");
});

test("a line with sinks of two weaknesses reports the first of the catalog, and a new weakness never comes first", () => {
  assert.strictEqual(sinkOf("app/run.py", "os.system('cmd ' + arg); data = pickle.loads(blob)"), "unsafe deserialization (CWE-502)");
  assert.strictEqual(sinkOf("scripts/deploy.sh", "ssh -o StrictHostKeyChecking=no host 'chmod 777 /srv'"), "world-writable mode (CWE-732)");
  assert.strictEqual(WEAKNESSES.at(-1).label, "disabled host key verification (CWE-322)");
});

test("each rule names known languages and each language maps to its extensions only", () => {
  for (const { label, rules } of WEAKNESSES) {
    for (const [languages] of rules) {
      for (const language of languages.split(" ")) assert.ok(LANGUAGES[language], `${label}: ${language}`);
    }
  }
  assert.strictEqual(sinkOf("src/a.mts", "eval(code);"), null, "an extension no language lists");
});

test("safe forms, mentions and sinks of another language find nothing", () => {
  for (const [file, line] of SAFE) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("a line that is only a comment in the language of its file finds nothing", () => {
  for (const [file, line] of COMMENTS) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("only the comment markers of the file's language skip a line, and code after a closed block comment counts", () => {
  assert.strictEqual(isCommentOnly("src/a.rs", "#[cfg(test)]"), false, "a Rust attribute");
  assert.strictEqual(isCommentOnly("src/a.c", "#include <stdio.h>"), false, "a C directive");
  assert.strictEqual(isCommentOnly("src/a.py", "// not a comment in Python"), false);
  assert.strictEqual(isCommentOnly("src/a.js", "/* note */ eval(code);"), false);
  assert.strictEqual(sinkOf("src/a.js", "/* note */ eval(code);"), "code evaluation (CWE-94)");
  assert.strictEqual(isCommentOnly("src/a.c", "*cmd = 0;"), false, "a dereference");
  assert.strictEqual(isCommentOnly("src/a.vue", "// eval(x)"), false, "a language without rules is never skipped");
});

test("a SafeLoader protects only its own yaml.load call", () => {
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(f, Loader=yaml.CSafeLoader); b = yaml.load(g)"), "unsafe YAML load (CWE-502)");
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(open(f), Loader=SafeLoader)"), null);
});
