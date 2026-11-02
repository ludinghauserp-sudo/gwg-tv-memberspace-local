import Foundation
import Network
import CSQLite
public final class LocalHTTPServer {
 let root:URL,dataRoot:URL
 var db:OpaquePointer?
 var listener:NWListener?
 let queue=DispatchQueue(label:"gwgtv.local.server")
 public var onReady:((URL)->Void)?
 public var onFailure:((String)->Void)?
 public private(set) var origin=""
 let transient=unsafeBitCast(-1,to:sqlite3_destructor_type.self)
 public init(root:URL,dataRoot:URL)throws{
  self.root=root.standardizedFileURL;self.dataRoot=dataRoot.standardizedFileURL
  try FileManager.default.createDirectory(at:dataRoot,withIntermediateDirectories:true)
  try FileManager.default.createDirectory(at:dataRoot.appendingPathComponent("photos"),withIntermediateDirectories:true)
  guard sqlite3_open_v2(dataRoot.appendingPathComponent("workspace.sqlite3").path,&db,SQLITE_OPEN_CREATE|SQLITE_OPEN_READWRITE|SQLITE_OPEN_FULLMUTEX,nil)==SQLITE_OK else{throw NSError(domain:"SQLite",code:1,userInfo:[NSLocalizedDescriptionKey:"Could not open local database."])}
  sqlite3_busy_timeout(db,5000)
  try sql("PRAGMA journal_mode=WAL;")
  try sql("CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload BLOB NOT NULL);")
  try sql("INSERT OR IGNORE INTO workspace VALUES(1,0,'null');")
  try sql("CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,mime TEXT NOT NULL);")
 }
 deinit{sqlite3_close(db)}
 func sql(_ value:String)throws{if sqlite3_exec(db,value,nil,nil,nil) != SQLITE_OK{throw NSError(domain:"SQLite",code:2,userInfo:[NSLocalizedDescriptionKey:String(cString:sqlite3_errmsg(db))])}}
 func snapshot()throws->[String:Any]{var stmt:OpaquePointer?;guard sqlite3_prepare_v2(db,"SELECT revision,payload FROM workspace WHERE id=1",-1,&stmt,nil)==SQLITE_OK else{throw error("Could not read workspace")};defer{sqlite3_finalize(stmt)};guard sqlite3_step(stmt)==SQLITE_ROW else{throw error("Missing workspace")};let count=Int(sqlite3_column_bytes(stmt,1));let bytes=sqlite3_column_blob(stmt,1)!;let value=try JSONSerialization.jsonObject(with:Data(bytes:bytes,count:count),options:.fragmentsAllowed);return ["revision":Int(sqlite3_column_int64(stmt,0)),"state":value]}
 func error(_ text:String)->NSError{NSError(domain:"GWGTV",code:1,userInfo:[NSLocalizedDescriptionKey:text])}
 public func start(port:UInt16=8765)throws{
  let params=NWParameters.tcp;params.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:NWEndpoint.Port(rawValue:port)!)
  let listener=try NWListener(using:params);self.listener=listener
  listener.newConnectionHandler={ [weak self] connection in guard let self else{return};connection.start(queue:self.queue);self.receive(connection,Data()) }
  listener.stateUpdateHandler={ [weak self] state in guard let self else{return};switch state{case .ready:guard let port=listener.port else{return};self.origin="http://127.0.0.1:\(port.rawValue)";print("GWG TV Member Space: \(self.origin)/members");fflush(stdout);self.onReady?(URL(string:self.origin+"/members")!);case .failed(let e):fputs("Local server error: \(e)\n",stderr);self.onFailure?("Could not start the local server. Another copy may already be using this port. \(e)");default:break}}
  listener.start(queue:queue)
 }
 public func stop(){listener?.cancel()}
 func receive(_ conn:NWConnection,_ prior:Data){conn.receive(minimumIncompleteLength:1,maximumLength:65536){[weak self] bytes,_,complete,err in guard let self else{return};var all=prior;if let bytes{all.append(bytes)};if all.count>100*1024*1024{self.send(conn,413,Data("Too large".utf8));return};if let split=all.range(of:Data("\r\n\r\n".utf8)){let header=String(decoding:all[..<split.lowerBound],as:UTF8.self);let lines=header.components(separatedBy:"\r\n");let first=(lines.first ?? "").components(separatedBy:" ");guard first.count>=2 else{self.send(conn,400,Data());return};var headers:[String:String]=[:];for line in lines.dropFirst(){if let colon=line.firstIndex(of:":"){headers[String(line[..<colon]).lowercased()]=line[line.index(after:colon)...].trimmingCharacters(in:.whitespaces)}};let size=Int(headers["content-length"] ?? "0") ?? 0;if size<0||size>96*1024*1024{self.send(conn,413,Data());return};if all.count>=split.upperBound+size{let body=all.subdata(in:split.upperBound..<split.upperBound+size);self.handle(conn,method:first[0],target:first[1],headers:headers,body:body);return}}else if all.count>65536{self.send(conn,431,Data());return};if err != nil||complete{conn.cancel()}else{self.receive(conn,all)}}}
 func send(_ conn:NWConnection,_ status:Int,_ data:Data,mime:String="text/plain; charset=utf-8",headers:[String:String]=[:],head:Bool=false){var text="HTTP/1.1 \(status) \(status==200 ? "OK":"Error")\r\nContent-Length: \(data.count)\r\nContent-Type: \(mime)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n";for(k,v)in headers{text += "\(k): \(v)\r\n"};text += "\r\n";var output=Data(text.utf8);if !head{output.append(data)};conn.send(content:output,completion:.contentProcessed{_ in conn.cancel()})}
 func json(_ conn:NWConnection,_ value:Any,_ status:Int=200){send(conn,status,(try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys])) ?? Data("{}".utf8),mime:"application/json")}
 func handle(_ conn:NWConnection,method:String,target:String,headers:[String:String],body:Data){
  guard headers["host"]==String(origin.dropFirst(7)) else{send(conn,403,Data());return}
  if method=="POST" && headers["origin"] != origin {send(conn,403,Data("Only this local workspace can save data.".utf8));return}
  guard let components=URLComponents(string:origin+target),let path=components.path.removingPercentEncoding else{send(conn,400,Data());return}
  do{
   if path=="/local/health"{json(conn,["ok":true,"local":true,"runtime":"Swift","dataPath":dataRoot.path]);return}
   if path=="/local/state"{
    if method=="GET"{json(conn,try snapshot());return}
    guard method=="POST",let input=try JSONSerialization.jsonObject(with:body) as? [String:Any],let revision=input["expectedRevision"] as? Int,let state=input["state"] as? [String:Any],state["gear"] is [Any],state["plans"] is [Any] else{throw error("Invalid workspace data")}
    let encoded=try JSONSerialization.data(withJSONObject:state);guard encoded.count<64*1024*1024 else{throw error("Workspace too large")};var stmt:OpaquePointer?;sqlite3_prepare_v2(db,"UPDATE workspace SET revision=revision+1,payload=? WHERE id=1 AND revision=?",-1,&stmt,nil);defer{sqlite3_finalize(stmt)};encoded.withUnsafeBytes{p in _=sqlite3_bind_blob(stmt,1,p.baseAddress,Int32(encoded.count),transient)};sqlite3_bind_int64(stmt,2,Int64(revision));guard sqlite3_step(stmt)==SQLITE_DONE else{throw error("Could not save database")};if sqlite3_changes(db)==0{json(conn,["error":"Workspace changed"],409)}else{json(conn,["success":true])};return
   }
   if path=="/api/members/photos"{
    if method=="POST"{guard body.count>8 && body.count<=5*1024*1024 else{throw error("Photo must be under 5 MB")};let b=[UInt8](body.prefix(12));let mime=b[0]==255&&b[1]==216 ? "image/jpeg":b[0]==137&&b[1]==80&&b[2]==78&&b[3]==71 ? "image/png":String(decoding:body.prefix(4),as:UTF8.self)=="RIFF"&&String(decoding:body.dropFirst(8).prefix(4),as:UTF8.self)=="WEBP" ? "image/webp":"";guard !mime.isEmpty else{throw error("Use JPEG, PNG or WebP")};let id=UUID().uuidString.lowercased();try body.write(to:dataRoot.appendingPathComponent("photos/"+id),options:.atomic);try sql("INSERT INTO photos VALUES('\(id)','\(mime)')");json(conn,["id":id,"url":"/api/members/photos?id="+id]);return}
    guard let id=components.queryItems?.first(where:{$0.name=="id"})?.value,UUID(uuidString:id) != nil else{throw error("Invalid photo")};var stmt:OpaquePointer?;sqlite3_prepare_v2(db,"SELECT mime FROM photos WHERE id=?",-1,&stmt,nil);defer{sqlite3_finalize(stmt)};sqlite3_bind_text(stmt,1,id,-1,transient);guard sqlite3_step(stmt)==SQLITE_ROW else{send(conn,404,Data());return};let mime=String(cString:sqlite3_column_text(stmt,0));send(conn,200,try Data(contentsOf:dataRoot.appendingPathComponent("photos/"+id)),mime:mime);return
   }
   if path=="/local/backup"{
    if method=="GET"{var backup=try snapshot();backup["format"]="GWG-TV-Local-v1";var photos:[[String:String]]=[];var stmt:OpaquePointer?;sqlite3_prepare_v2(db,"SELECT id,mime FROM photos",-1,&stmt,nil);while sqlite3_step(stmt)==SQLITE_ROW{let id=String(cString:sqlite3_column_text(stmt,0)),mime=String(cString:sqlite3_column_text(stmt,1));if let bytes=try? Data(contentsOf:dataRoot.appendingPathComponent("photos/"+id)){photos.append(["id":id,"mime":mime,"data":bytes.base64EncodedString()])}};sqlite3_finalize(stmt);backup["photos"]=photos;send(conn,200,try JSONSerialization.data(withJSONObject:backup),mime:"application/json",headers:["Content-Disposition":"attachment; filename=GWG-TV-Workspace.gwgbackup.json"]);return}
    guard method=="POST",let input=try JSONSerialization.jsonObject(with:body) as? [String:Any],input["format"] as? String=="GWG-TV-Local-v1",let state=input["state"] as? [String:Any],state["gear"] is [Any],state["plans"] is [Any] else{throw error("Choose a GWG TV complete backup")};let photos=input["photos"] as? [[String:String]] ?? [];for p in photos{guard let id=p["id"],UUID(uuidString:id) != nil,let mime=p["mime"],["image/png","image/jpeg","image/webp"].contains(mime),let base64=p["data"],let bytes=Data(base64Encoded:base64),bytes.count<=5*1024*1024 else{throw error("Invalid backup photo")}}
    var safe=try snapshot();safe["format"]="GWG-TV-Local-v1";try JSONSerialization.data(withJSONObject:safe).write(to:dataRoot.appendingPathComponent("before-import-\(Int(Date().timeIntervalSince1970)).json"),options:.atomic)
    try sql("BEGIN IMMEDIATE");do{for p in photos{let id=p["id"]!,mime=p["mime"]!;let url=dataRoot.appendingPathComponent("photos/"+id);if !FileManager.default.fileExists(atPath:url.path){try Data(base64Encoded:p["data"]!)!.write(to:url,options:.atomic)};try sql("INSERT OR REPLACE INTO photos VALUES('\(id)','\(mime)')")};let bytes=try JSONSerialization.data(withJSONObject:state);var stmt:OpaquePointer?;sqlite3_prepare_v2(db,"UPDATE workspace SET revision=revision+1,payload=? WHERE id=1",-1,&stmt,nil);bytes.withUnsafeBytes{p in _=sqlite3_bind_blob(stmt,1,p.baseAddress,Int32(bytes.count),transient)};guard sqlite3_step(stmt)==SQLITE_DONE else{sqlite3_finalize(stmt);throw error("Import failed")};sqlite3_finalize(stmt);try sql("COMMIT")}catch{try? sql("ROLLBACK");throw error};json(conn,["success":true]);return
   }
   guard method=="GET"||method=="HEAD" else{send(conn,405,Data());return}
   var file=root.appendingPathComponent(path=="/" ? "index.html":String(path.dropFirst())).standardizedFileURL
   guard file.path.hasPrefix(root.path+"/") else{send(conn,403,Data());return}
   if !FileManager.default.fileExists(atPath:file.path){if path.hasPrefix("/api/"){json(conn,["error":"Local API is available through the workspace UI"],404);return};if path.hasPrefix("/members")||path=="/admin"{file=root.appendingPathComponent("index.html")}else{send(conn,404,Data());return}}
   let mime=["html":"text/html; charset=utf-8","js":"text/javascript; charset=utf-8","css":"text/css; charset=utf-8","png":"image/png","jpg":"image/jpeg","svg":"image/svg+xml","json":"application/json","woff2":"font/woff2"][file.pathExtension] ?? "application/octet-stream";send(conn,200,try Data(contentsOf:file),mime:mime,head:method=="HEAD")
  }catch{json(conn,["error":error.localizedDescription],400)}
 }
}
