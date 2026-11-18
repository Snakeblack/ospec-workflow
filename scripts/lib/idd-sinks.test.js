"use strict";

// E1.50 content-security-signal: the corpus of security sinks by stack. Each
// sink is found in the languages where its API exists; a safe form, a comment
// or another language finds nothing (openspec/specs/idd/spec.md, REQ-idd-012).
// E1.102 adds HTML written without escaping and weak ciphers, with the
// legitimate uses of each API as safe neighbors.

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

const XSS = "unescaped HTML output (CWE-79)";
const CIPHER = "weak cipher (CWE-327)";

// [file, added line]: HTML written without escaping, from a value that is
// neither a constant nor escaped or sanitized on the same line.
const HTML_SINKS = [
  // The DOM, in JS and in the scripts of web files.
  ["src/ui.js", "list.innerHTML = items.map(render).join('');"],
  ["src/ui.js", "list.innerHTML = items.map((item) => `<li>${item.name}</li>`).join('');"],
  ["src/ui.js", "list.innerHTML = items.map((item) => { return `<li>${esc(item)}</li>`; }).join('');"],
  ["src/ui.js", "row.innerHTML = `<td>${user.name}</td>`;"],
  ["src/ui.js", "box.innerHTML += '<li>' + label + '</li>';"],
  ["src/ui.ts", "node.outerHTML = html;"],
  ["src/ui.js", "panel.insertAdjacentHTML('beforeend', markup);"],
  ["src/ui.js", "document.write('<p>' + message + '</p>');"],
  ["src/ui.js", "cell.innerHTML = `${esc(name)} <small>${note}</small>`;"],
  ["src/ui.js", "out.innerHTML = value || '';"],
  ["src/App.vue", "  el.innerHTML = message;"],
  ["public/index.html", "      contador.innerHTML = '<strong>' + pendientes + '</strong>';"],
  // Framework APIs made to skip the escape.
  ["src/Post.jsx", "<div dangerouslySetInnerHTML={{ __html: post.body }} />"],
  ["src/Post.tsx", "<article dangerouslySetInnerHTML={{ __html: marked(text) }} />"],
  ["src/post.js", "h('div', { dangerouslySetInnerHTML: { __html: html } });"],
  ["src/Card.jsx", "<div innerHTML={props.html} />"],
  ["src/view.ts", "return html`<div>${unsafeHTML(content)}</div>`;"],
  ["src/app/markdown.pipe.ts", "return this.sanitizer.bypassSecurityTrustHtml(rendered);"],
  ["src/app/frame.ts", "this.url = this.sanitizer.bypassSecurityTrustResourceUrl(link);"],
  ["src/components/Post.vue", '<div v-html="post.body"></div>'],
  ["src/components/Post.vue", '<div :innerHTML="html"></div>'],
  ["src/routes/Post.svelte", "{@html post.body}"],
  ["src/layouts/Base.astro", '<script type="application/ld+json" set:html={JSON.stringify(data)} />'],
  ["src/pages/post.astro", "<Fragment set:html={content} />"],
  ["templates/post.html", "{{ post.body|safe }}"],
  ["templates/post.html", "<div>{{ comment.text | linebreaks | safe }}</div>"],
  ["src/main/resources/templates/post.html", '<div th:utext="${post.body}"></div>'],
  ["app/views.py", "return mark_safe(f'<b>{name}</b>')"],
  ["app/views.py", "html = Markup('<b>' + name + '</b>')"],
  ["app/views.py", "return SafeString(body)"],
  ["templates/post.jinja", "{{ body | safe }}"],
  ["templates/post.j2", "<p>{{ note|safe }}</p>"],
  ["srv/view.go", "data.Body = template.HTML(post.Body)"],
  ["srv/view.go", 'data.Body = template.HTML(fmt.Sprintf("<b>%s</b>", name))'],
  ["Api/Helpers.cs", "return new HtmlString(markup);"],
  ["Views/Post/Show.cshtml", "<div>@Html.Raw(Model.Body)</div>"],
  ["Pages/Post.razor", "<div>@((MarkupString)Body)</div>"],
  ["Pages/Post.razor", "var content = new MarkupString(html);"],
  ["app/helpers/posts_helper.rb", "body.html_safe"],
  ["app/helpers/posts_helper.rb", '"<b>#{name}</b>".html_safe'],
  ["app/helpers/posts_helper.rb", "raw(post.body)"],
  ["app/views/posts/show.html.erb", "<%== post.body %>"],
  ["app/views/posts/show.html.erb", "<%= raw post.body %>"],
  ["app/views/posts/show.html.erb", "<%= post.body.html_safe %>"],
  ["resources/views/post.blade.php", "<div>{!! $post->body !!}</div>"],
  ["templates/post.html.twig", "{{ post.body|raw }}"],
  ["views/post.ejs", "<div><%- post.body %></div>"],
  ["views/post.hbs", "<div>{{{post.body}}}</div>"],
  ["src/page.rs", "html! { div { (PreEscaped(body)) } }"],
  ["src/page.rs", 'div { dangerous_inner_html: "{html}" }'],
  // A value that goes on below, as formatters lay it out, is one the line
  // cannot show safe.
  ["src/ui.js", "el.innerHTML = '<div>' +"],
  ["src/ui.js", "el.innerHTML ="],
  ["src/ui.js", "el.innerHTML = `"],
  ["src/ui.js", "document.write("],
  ["src/ui.js", "panel.insertAdjacentHTML('beforeend',"],
  ["app/views.py", "return mark_safe("],
  ["src/Post.jsx", "dangerouslySetInnerHTML={{"],
  ["src/pages/post.astro", "<Fragment set:html={"],
  ["templates/post.html", "  | safe }}"],
  ["app/views/posts/show.html.erb", "<%== post.body"],
  ["resources/views/post.blade.php", "{!! $post->body"],
  ["views/post.hbs", "{{{post.body"],
  // Text formatting, comments, paths and partial escaping are no number.
  ["app/views.py", 'return mark_safe(_("Hi <b>%s</b>") % user.name)'],
  ["app/views.py", "return mark_safe(TEMPLATE % (url, label))"],
  ["src/ui.js", "el.innerHTML = html // from the API"],
  ["src/ui.js", "el.innerHTML = html /* trusted */;"],
  ["views/post.hbs", "{{{../body}}}"],
  ["views/post.hbs", "{{{post-body}}}"],
  ["src/ui.js", "el.innerHTML = name.replace('<', '&lt;');"],
  ["src/ui.js", "el.innerHTML = name.replace(/</, '&lt;');"],
  // An escape that covers only part of the value, and text repeated in Python
  // or Ruby.
  ["src/ui.js", "el.innerHTML = '<b>' + name + s.replace(/</g, '&lt;');"],
  ["src/ui.js", "el.innerHTML = c ? name : s.replace(/</g, '');"],
  ["app/views.py", "return mark_safe(name * 2)"],
  ["app/helpers/posts_helper.rb", "raw(name * 2)"],
  // React's own sink, whatever builds its value.
  ["src/Post.jsx", "<div dangerouslySetInnerHTML={markup} />"],
  ["src/Post.jsx", "<div dangerouslySetInnerHTML={createMarkup()} />"],
  ["src/Post.jsx", "<div dangerouslySetInnerHTML={{ __html }} />"],
  // The body of a view, not of a layout, and Handlebars names and paths, which
  // hold no arithmetic.
  ["views/post.hbs", "{{#each comments}}<div>{{{body}}}</div>{{/each}}"],
  ["views/post.hbs", "<div>{{{post/body}}}</div>"],
  ["views/post.hbs", "<div>{{{item-1}}}</div>"],
  // Astro reads an attribute between backticks as a template literal.
  ["src/pages/post.astro", "<Fragment set:html=`<p>${post.body}</p>` />"],
];

// [file, added line]: the same APIs with a constant, an escaped or a sanitized
// value, and the forms that escape by themselves.
const HTML_SAFE = [
  ["src/ui.js", "list.innerHTML = '';"],
  ["src/ui.js", 'panel.innerHTML = "<p>Loading…</p>";'],
  ["src/ui.js", "panel.innerHTML = `<span class=\"spinner\"></span>`;"],
  ["src/ui.js", "row.innerHTML = `<td>${esc(user.name)}</td><td>${escapeHtml(user.mail)}</td>`;"],
  ["src/ui.js", "box.innerHTML = '<li>' + escape(label) + '</li>';"],
  ["src/ui.js", "box.innerHTML = DOMPurify.sanitize(html);"],
  ["src/ui.js", "box.innerHTML = sanitizeHtml(input, { allowedTags: ['b'] });"],
  ["src/ui.js", "bar.innerHTML = `<span style=\"width:${(value / max) * 100}%\">${esc(label)}</span>`;"],
  ["src/ui.js", "dial.innerHTML = `<b style=\"font-size:${Math.round(size / 5)}px\">${esc(label)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}`;"],
  ["src/ui.js", "row.innerHTML = `<td class=\"${over ? 'bad' : 'ok'}\">${esc(note)}</td>`;"],
  ["src/ui.js", "list.innerHTML = items.map((item) => `<li>${esc(item.name)}</li>`).join('');"],
  ["src/ui.js", "tip.innerHTML = `<b>${esc(title)}</b>` + rows.map((r) => `<div>${r.value == null ? '–' : esc(format(r.value))}</div>`).join('');"],
  ["src/ui.js", "list.innerHTML = ''"],
  ["src/ui.js", "list.innerHTML = '' // reset"],
  ["src/ui.js", "list.innerHTML = items.map((x) => `<li>${esc(x)}</li>`).join();"],
  ["src/ui.js", "badge.innerHTML = count - 1;"],
  ["src/ui.js", "badge.innerHTML = items.length;"],
  ["src/ui.js", "badge.innerHTML = `${(done / total) * 100}%`;"],
  ["src/ui.js", "el.innerHTML = name.replace(/</g, '&lt;');"],
  ["src/ui.js", "el.innerHTML = name.replaceAll('<', '&lt;');"],
  ["src/ui.js", "el.innerHTML = (prefix + name).trim().replace(/</g, '&lt;');"],
  ["src/ui.js", "badge.innerHTML = count * 2;"],
  ["app/views.py", "return mark_safe(2 * 3)"],
  ["app/views/posts/show.html.erb", "<%== '<br>' -%>"],
  ["src/ui.js", "if (el.innerHTML === '') render();"],
  ["src/ui.js", "const markup = el.outerHTML;"],
  ["src/ui.js", "el.textContent = message;"],
  ["src/ui.js", "$(el).html(content);"],
  ["src/Post.jsx", "<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />"],
  ["src/Post.jsx", "<style dangerouslySetInnerHTML={{ __html: '.a { color: red }' }} />"],
  ["src/app/icon.ts", "return this.sanitizer.bypassSecurityTrustHtml('<svg viewBox=\"0 0 24 24\"></svg>');"],
  ["src/app/chat.html", '<div [innerHTML]="msg.content | markdown"></div>'],
  ["src/components/Post.vue", '<div v-html="\'<br>\'"></div>'],
  ["src/components/Post.vue", "<!-- <div v-html=\"post.body\"></div> -->"],
  ["src/components/Post.vue", "// el.innerHTML = message"],
  ["src/layouts/Base.astro", '<script type="application/ld+json" set:html={JSON.stringify(data).replace(/</g, "\\\\u003c")} />'],
  ["src/pages/post.astro", '<Fragment set:html="<hr>" />'],
  ["src/pages/post.astro", "<Fragment set:html=`<hr>` />"],
  ["templates/post.html", "{{ post.body }}"],
  ["templates/post.html", "{{ '<br>'|safe }}"],
  ["templates/post.jinja", "{# {{ body|safe }} #}"],
  ["app/views.py", "return mark_safe('<br>')"],
  ["app/views.py", "return mark_safe(escape(name))"],
  ["app/views.py", "return Markup(bleach.clean(body))"],
  ["app/views.py", "return format_html('<b>{}</b>', name)"],
  ["srv/view.go", 'data.Sep = template.HTML("<hr>")'],
  ["srv/view.go", "data.Body = template.HTML(policy.Sanitize(post.Body))"],
  ["Views/Post/Show.cshtml", "<div>@Html.Raw(sanitizer.Sanitize(Model.Body))</div>"],
  ["Views/Post/Show.cshtml", "@* @Html.Raw(Model.Body) *@"],
  ["Views/Post/Show.cshtml", "<div>@Model.Body</div>"],
  ["app/helpers/posts_helper.rb", '"<br>".html_safe'],
  ["app/helpers/posts_helper.rb", "Sanitize.fragment(body).html_safe"],
  ["app/views/posts/show.html.erb", "<%= post.body %>"],
  ["app/views/posts/show.html.erb", "<%# raw post.body %>"],
  ["resources/views/post.blade.php", "<div>{{ $post->body }}</div>"],
  ["views/post.ejs", "<%- include('partials/header') %>"],
  ["views/post.ejs", "<%= post.body %>"],
  ["views/layouts/main.hbs", "{{{body}}}"],
  ["views/post.hbs", "{{!-- {{{post.body}}} --}}"],
  ["views/post.hbs", "{{post.body}}"],
];

// [file, added line]: a weak cipher or ECB, chosen by the call that picks the
// algorithm, when encrypting or decrypting.
const CIPHER_SINKS = [
  ["srv/crypt.go", "block, err := des.NewCipher(key)"],
  ["srv/crypt.go", "block, err := des.NewTripleDESCipher(key)"],
  ["srv/crypt.go", "c, err := rc4.NewCipher(key)"],
  ["srv/crypt.go", "c, err := blowfish.NewCipher(key)"],
  ["srv/crypt.go", "mode := ecb.NewECBEncrypter(block)"],
  ["src/crypt.js", "const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv);"],
  ["src/crypt.js", "const d = createDecipheriv('aes-128-ecb', key, null);"],
  ["src/crypt.ts", 'const c = crypto.createCipheriv("rc4", key, "");'],
  ["src/crypt.js", "const c = createCipheriv('bf-cbc', key, iv);"],
  ["src/crypt.js", "const out = CryptoJS.TripleDES.encrypt(text, key);"],
  ["src/crypt.js", "const out = CryptoJS.AES.encrypt(text, key, { mode: CryptoJS.mode.ECB });"],
  ["src/crypt.js", "const c = forge.cipher.createCipher('3DES-CBC', key);"],
  ["app/crypt.py", "cipher = DES.new(key, DES.MODE_CBC, iv)"],
  ["app/crypt.py", "cipher = DES3.new(key, DES3.MODE_CBC, iv)"],
  ["app/crypt.py", "cipher = ARC4.new(key)"],
  ["app/crypt.py", "cipher = Blowfish.new(key, Blowfish.MODE_CBC, iv)"],
  ["app/crypt.py", "cipher = AES.new(key, AES.MODE_ECB)"],
  ["app/crypt.py", "cipher = Cipher(algorithms.TripleDES(key), modes.CBC(iv))"],
  ["app/crypt.py", "cipher = Cipher(algorithms.AES(key), modes.ECB())"],
  ["app/crypt.py", "k = pyDes.triple_des(key)"],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("DES/CBC/PKCS5Padding");'],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("DESede");'],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("RC4");'],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("AES/ECB/PKCS5Padding");'],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("AES");'],
  ["src/main/java/Crypt.java", 'SecretKeyFactory f = SecretKeyFactory.getInstance("PBEWithMD5AndDES");'],
  ["src/main/kotlin/Crypt.kt", 'val kg = KeyGenerator.getInstance("Blowfish")'],
  ["Api/Crypt.cs", "using var des = DES.Create();"],
  ["Api/Crypt.cs", "var tdes = TripleDES.Create();"],
  ["Api/Crypt.cs", "var rc2 = new RC2CryptoServiceProvider();"],
  ["Api/Crypt.cs", "aes.Mode = CipherMode.ECB;"],
  ["Api/Crypt.cs", "var bytes = aes.EncryptEcb(data, PaddingMode.PKCS7);"],
  ["app/crypt.rb", "cipher = OpenSSL::Cipher.new('des-ede3-cbc')"],
  ["app/crypt.rb", "cipher = OpenSSL::Cipher.new('aes-256-ecb')"],
  ["app/crypt.rb", "cipher = OpenSSL::Cipher::AES.new(128, :ECB)"],
  ["web/crypt.php", "$out = openssl_encrypt($data, 'des-ede3-cbc', $key, 0, $iv);"],
  ["web/crypt.php", "$out = openssl_decrypt($data, 'AES-128-ECB', $key);"],
  ["web/crypt.php", "$out = mcrypt_encrypt(MCRYPT_RIJNDAEL_128, $key, $data, MCRYPT_MODE_ECB);"],
  ["web/crypt.php", "$c = new TripleDES();"],
  ["src/crypt.rs", "let cipher = TdesEde3::new_from_slice(&key)?;"],
  ["src/crypt.rs", "let mut rc4 = Rc4::new(key.into());"],
  ["src/crypt.rs", "let enc = ecb::Encryptor::<Aes128>::new(&key.into());"],
  ["src/crypt.rs", "let c = Crypter::new(Cipher::des_ede3_cbc(), Mode::Encrypt, &key, Some(&iv))?;"],
  ["scripts/backup.sh", "openssl enc -des3 -in db.sql -out db.enc"],
  ["scripts/backup.sh", "openssl enc -aes-128-ecb -in db.sql -out db.enc -K $KEY"],
  ["scripts/backup.sh", "openssl des3 -d -in db.enc -out db.sql"],
];

// [file, added line]: strong ciphers and modes, and words that only name one.
const CIPHER_SAFE = [
  ["srv/crypt.go", "block, err := aes.NewCipher(key)"],
  ["srv/crypt.go", "gcm, err := cipher.NewGCM(block)"],
  ["srv/rates.go", 'const ecbRatesURL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"'],
  ["src/crypt.js", "const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);"],
  ["src/rates.js", "const rates = await fetchEcbRates(); // ECB reference rates"],
  ["src/des.js", "const DES = { title: 'Descripción' };"],
  ["app/crypt.py", "cipher = AES.new(key, AES.MODE_GCM)"],
  ["app/crypt.py", "cipher = Cipher(algorithms.AES(key), modes.GCM(iv))"],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("AES/GCM/NoPadding");'],
  ["src/main/java/Crypt.java", 'Cipher c = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");'],
  ["src/main/java/Crypt.java", 'SecretKeyFactory f = SecretKeyFactory.getInstance("PBEWithHmacSHA256AndAES_256");'],
  ["Api/Crypt.cs", "using var aes = Aes.Create();"],
  ["Api/Crypt.cs", "aes.Mode = CipherMode.CBC;"],
  ["app/crypt.rb", "cipher = OpenSSL::Cipher.new('aes-256-gcm')"],
  ["web/crypt.php", "$out = openssl_encrypt($data, 'aes-256-gcm', $key, 0, $iv, $tag);"],
  ["src/crypt.rs", "let cipher = Aes256Gcm::new(&key);"],
  ["scripts/backup.sh", "openssl enc -aes-256-cbc -pbkdf2 -in db.sql -out db.enc"],
  ["scripts/backup.sh", "# openssl enc -des3 -in db.sql -out db.enc"],
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
  assert.strictEqual(sinkOf("src/ui.js", "el.innerHTML = eval(code);"), "code evaluation (CWE-94)");
  assert.strictEqual(sinkOf("app/crypt.py", "key = hashlib.md5(password).digest(); c = DES.new(key)"), "weak credential hash (CWE-327)");
  // The labels are part of the keys of the answers already given: the ones of
  // E1.50 and E1.100 keep their place, and each new weakness goes after them.
  assert.deepStrictEqual(
    WEAKNESSES.map(({ label }) => label),
    [
      "disabled TLS verification (CWE-295)",
      "unsafe deserialization (CWE-502)",
      "unsafe YAML load (CWE-502)",
      "code evaluation (CWE-94)",
      "composed shell command (CWE-78)",
      "composed SQL (CWE-89)",
      "weak credential hash (CWE-327)",
      "credentialed wildcard CORS (CWE-942)",
      "world-writable mode (CWE-732)",
      "unverified JWT (CWE-347)",
      "disabled CSRF protection (CWE-352)",
      "XML external entities (CWE-611)",
      "disabled host key verification (CWE-322)",
      XSS,
      CIPHER,
    ],
  );
});

test("HTML written without escaping is found in code and templates, unless its value is constant, escaped or sanitized", () => {
  for (const [file, line] of HTML_SINKS) assert.strictEqual(sinkOf(file, line), XSS, `${file}: ${line}`);
  for (const [file, line] of HTML_SAFE) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("a value nested too deep to read counts as a sink instead of failing", () => {
  const depth = 20000;
  assert.strictEqual(sinkOf("src/ui.js", `x.innerHTML = ${"`${".repeat(depth)}1${"}`".repeat(depth)};`), XSS);
});

test("an operand with many brackets is read in one pass, whether it matches or not", () => {
  for (const group of ["()", "[0]"]) {
    const started = Date.now();
    assert.strictEqual(sinkOf("src/ui.js", `x.innerHTML = a${group.repeat(40)}! / 2;`), XSS, group);
    assert.strictEqual(sinkOf("src/ui.js", `x.innerHTML = a${group.repeat(40)} / 2;`), null, group);
    assert.ok(Date.now() - started < 1000, `${group}: ${Date.now() - started} ms`);
  }
});

test("a value the next added line goes on with, after a leading operator, is unfinished", () => {
  assert.strictEqual(sinkOf("src/ui.js", "list.innerHTML = '<ul>'", '  + items + "</ul>";'), XSS);
  assert.strictEqual(sinkOf("src/ui.js", "list.innerHTML = '<ul>'", "  ? a : b;"), XSS);
  assert.strictEqual(sinkOf("src/ui.js", "list.innerHTML = '<ul>';", "+value;"), null, "a semicolon ends it");
  assert.strictEqual(sinkOf("src/ui.js", "list.innerHTML = ''", "render(list);"), null, "an unrelated statement");
});

test("an HTML file may be a server template, so its comments still count", () => {
  assert.strictEqual(sinkOf("templates/post.html", "<!-- {{ comment.text|safe }} -->"), XSS);
  assert.strictEqual(sinkOf("templates/post.html", "// {{ data|safe }}"), XSS);
  assert.strictEqual(sinkOf("templates/post.htm", '<!--/*/ <div th:utext="${x}"></div> /*/-->'), XSS);
  assert.strictEqual(sinkOf("templates/post.html", "<!-- note -->"), null);
  assert.strictEqual(sinkOf("src/components/Post.vue", '<!-- <div v-html="post.body"></div> -->'), null, "Vue drops its comments");
});

test("a weak cipher or the ECB mode is found in the call that picks it, never in a word that only names it", () => {
  for (const [file, line] of CIPHER_SINKS) assert.strictEqual(sinkOf(file, line), CIPHER, `${file}: ${line}`);
  for (const [file, line] of CIPHER_SAFE) assert.strictEqual(sinkOf(file, line), null, `${file}: ${line}`);
});

test("web files get every rule of JS, since their scripts are JS or TS", () => {
  assert.strictEqual(sinkOf("src/App.vue", "  const total = eval(formula);"), "code evaluation (CWE-94)");
  assert.strictEqual(sinkOf("src/routes/+page.svelte", "  execSync(`git log ${branch}`);"), "composed shell command (CWE-78)");
  assert.strictEqual(sinkOf("src/pages/index.astro", "const rows = await db.query(`SELECT * FROM t WHERE id = ${id}`);"), "composed SQL (CWE-89)");
  assert.strictEqual(sinkOf("public/index.html", "<script>eval(location.hash.slice(1))</script>"), "code evaluation (CWE-94)");
  assert.strictEqual(sinkOf("templates/post.erb", "eval(code)"), null, "a server template gets only its own forms");
});

test("each template language skips only the comments of its own syntax", () => {
  assert.strictEqual(isCommentOnly("src/App.vue", "<!-- eval(x) -->"), true);
  assert.strictEqual(isCommentOnly("src/App.vue", "/* eval(x) */"), true);
  assert.strictEqual(isCommentOnly("src/App.vue", "<!-- note --> <div v-html=\"x\"></div>"), false);
  assert.strictEqual(isCommentOnly("Views/A.cshtml", "@* note *@"), true);
  assert.strictEqual(isCommentOnly("app/views/a.html.erb", "<%# note %>"), true);
  assert.strictEqual(isCommentOnly("views/a.hbs", "{{!-- note --}}"), true);
  assert.strictEqual(isCommentOnly("templates/a.twig", "{# note #}"), true);
  // A server template renders what an HTML comment holds.
  assert.strictEqual(isCommentOnly("app/views/a.html.erb", "<!-- <%== x %> -->"), false);
  assert.strictEqual(sinkOf("app/views/a.html.erb", "<!-- <%== x %> -->"), XSS);
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
  assert.strictEqual(isCommentOnly("src/a.zig", "// eval(x)"), false, "a language without rules is never skipped");
});

test("a SafeLoader protects only its own yaml.load call", () => {
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(f, Loader=yaml.CSafeLoader); b = yaml.load(g)"), "unsafe YAML load (CWE-502)");
  assert.strictEqual(sinkOf("app/conf.py", "a = yaml.load(open(f), Loader=SafeLoader)"), null);
});
