// swift-tools-version: 5.9
import PackageDescription
let package = Package(name:"GWGMemberSpace",platforms:[.macOS(.v13)],products:[.executable(name:"GWGMemberSpace",targets:["MemberSpace"]),.executable(name:"GWGLocalServer",targets:["LocalServer"])],targets:[.systemLibrary(name:"CSQLite"),.target(name:"LocalCore",dependencies:["CSQLite"]),.executableTarget(name:"LocalServer",dependencies:["LocalCore"]),.executableTarget(name:"MemberSpace",dependencies:["LocalCore"])])
